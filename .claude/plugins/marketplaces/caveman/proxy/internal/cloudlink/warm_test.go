package cloudlink

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/JuliusBrussee/caveman/proxy/internal/gateway"
)

// warmGateway answers asks as Cloud does and warms with status and engine,
// counting each warm and what it carried. hold, when set, keeps warms open
// until it is closed.
type warmGateway struct {
	*httptest.Server
	warms, asks    atomic.Int32
	mu             sync.Mutex
	status         int
	engine         string
	auth, body     []string
	idempotencyKey bool
	hold           chan struct{}
}

func newWarmGateway(t *testing.T, status int, engine string) *warmGateway {
	g := &warmGateway{status: status, engine: engine}
	g.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		g.mu.Lock()
		if _, ok := r.Header["X-Idempotency-Key"]; ok {
			g.idempotencyKey = true
		}
		status, engine, hold := g.status, g.engine, g.hold
		g.mu.Unlock()
		if r.Header.Get("x-cave-warm") != "1" {
			g.asks.Add(1)
			_, _ = io.WriteString(w, `{"model":"claude-sonnet-5-5","reason":"ranked"}`)
			return
		}
		if hold != nil {
			<-hold
		}
		g.mu.Lock()
		g.auth, g.body = append(g.auth, r.Header.Get("authorization")), append(g.body, string(raw))
		g.mu.Unlock()
		g.warms.Add(1)
		w.Header().Set("x-cave-edge", "SJC")
		w.Header().Set("x-cave-edge-engine", engine)
		w.WriteHeader(status)
	}))
	t.Cleanup(g.Close)
	return g
}

func (g *warmGateway) waitWarms(t *testing.T, want int32) {
	t.Helper()
	for deadline := time.Now().Add(3 * time.Second); g.warms.Load() < want; time.Sleep(2 * time.Millisecond) {
		if time.Now().After(deadline) {
			t.Fatalf("warms = %d, want %d", g.warms.Load(), want)
		}
	}
}

const warmKey = "cave_project_key"

func warmCredentials() string {
	return `{"access_token":"` + token(time.Now().Add(time.Hour)) + `","gateway_api_key":"` + warmKey + `"}`
}

// A started link, signed in with routing on, warms once at start: the asks'
// own key, x-cave-warm and no body. Routing off, or a link no runtime
// started, never warms.
func TestStartWarmsTheRoutePath(t *testing.T) {
	g := newWarmGateway(t, http.StatusNoContent, "warm")
	link := newLink(cloudHome(t, g.URL, true, warmCredentials()))
	link.Start()
	g.waitWarms(t, 1)
	g.mu.Lock()
	auth, body := g.auth[0], g.body[0]
	g.mu.Unlock()
	if auth != "Bearer "+warmKey || body != "" {
		t.Fatalf("warm carried authorization %q body %q", auth, body)
	}

	off := newWarmGateway(t, http.StatusNoContent, "warm")
	link = newLink(cloudHome(t, off.URL, false, warmCredentials()))
	link.Start()
	unstarted := newLink(cloudHome(t, off.URL, true, warmCredentials()))
	unstarted.Prime()
	unstarted.Ask(t.Context(), messagesAsk("claude-opus-5-5"))()
	time.Sleep(50 * time.Millisecond)
	if off.warms.Load() != 0 {
		t.Fatalf("warms = %d with routing off or no runtime, want none", off.warms.Load())
	}
}

// A login after start warms: the link takes the new credential at its next
// read of the CLI state.
func TestLoginWarms(t *testing.T) {
	g := newWarmGateway(t, http.StatusNoContent, "warm")
	home := cloudHome(t, g.URL, true, "")
	link := newLink(home)
	link.Start()
	time.Sleep(20 * time.Millisecond)
	if g.warms.Load() != 0 {
		t.Fatal("warmed while signed out")
	}
	if err := os.WriteFile(filepath.Join(home, "credentials"), []byte(warmCredentials()), 0o600); err != nil {
		t.Fatal(err)
	}
	link.settings()
	g.waitWarms(t, 1)
}

// A session or prompt start warms only after warmQuiet without contact, and
// warms never overlap: many starts at once send one.
func TestPrimeWarmsWhenQuietAndOneAtATime(t *testing.T) {
	g := newWarmGateway(t, http.StatusNoContent, "warm")
	link := newLink(cloudHome(t, g.URL, true, warmCredentials()))
	var mu sync.Mutex
	now := time.Now()
	link.now = func() time.Time { mu.Lock(); defer mu.Unlock(); return now }
	link.mu.Lock()
	link.started = true
	link.mu.Unlock()
	link.settings() // signed in; the login warm goes out here
	g.waitWarms(t, 1)
	time.Sleep(20 * time.Millisecond)

	link.Prime() // contact a moment ago: nothing to do
	time.Sleep(50 * time.Millisecond)
	if g.warms.Load() != 1 {
		t.Fatalf("warms = %d right after contact, want 1", g.warms.Load())
	}

	mu.Lock()
	now = now.Add(warmQuiet)
	mu.Unlock()
	hold := make(chan struct{})
	g.mu.Lock()
	g.hold = hold
	g.mu.Unlock()
	for range 5 {
		link.Prime()
	}
	time.Sleep(50 * time.Millisecond)
	close(hold)
	g.waitWarms(t, 2)
	time.Sleep(50 * time.Millisecond)
	if g.warms.Load() != 2 {
		t.Fatalf("warms = %d after five starts at once, want one more", g.warms.Load())
	}
}

// Asks start a keep-alive that warms every warmEvery without other contact
// and stops warmFor after the last ask.
func TestKeepAliveWarmsWhileAsksCome(t *testing.T) {
	g := newWarmGateway(t, http.StatusNoContent, "warm")
	link := newLink(cloudHome(t, g.URL, true, warmCredentials()))
	link.warmEvery = 10 * time.Millisecond
	link.Start()
	g.waitWarms(t, 1) // the start warm
	if answer := link.Ask(t.Context(), messagesAsk("claude-opus-5-5"))(); answer.Model != "claude-sonnet-5-5" {
		t.Fatalf("ask = %+v", answer)
	}
	g.waitWarms(t, 4)
	link.mu.Lock()
	link.lastAsk = link.now().Add(-warmFor - time.Second) // the last ask was long ago
	link.mu.Unlock()
	for deadline := time.Now().Add(2 * time.Second); ; time.Sleep(5 * time.Millisecond) {
		link.mu.Lock()
		keeping := link.keeping
		link.mu.Unlock()
		if !keeping {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("the keep-alive outlived warmFor")
		}
	}
	stopped := g.warms.Load()
	time.Sleep(50 * time.Millisecond)
	if g.warms.Load() != stopped {
		t.Fatalf("warms went on after the keep-alive stopped: %d -> %d", stopped, g.warms.Load())
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.idempotencyKey {
		t.Error("the replay marker went on the wire")
	}
}

// Only a warm engine ends a pause, and only one a slow, unreachable or
// failing Cloud caused: a refused login or a limit holds, and a 204 whose
// engine is cold, timing out, failing or off changes nothing.
func TestWarmEngineEndsOnlyTransientPauses(t *testing.T) {
	for _, tc := range []struct {
		engine string
		paused gateway.RouteAnswer
		lifts  bool
	}{
		{"warm", gateway.RouteAnswer{Outcome: "degraded", Reason: "timeout"}, true},
		{"warm", gateway.RouteAnswer{Outcome: "degraded", Reason: "cloud_unreachable"}, true},
		{"warm", gateway.RouteAnswer{Outcome: "degraded", Reason: "cloud_503"}, true},
		{"warm", gateway.RouteAnswer{Outcome: "degraded", Reason: "cloud_401"}, false},
		{"warm", gateway.RouteAnswer{Outcome: "degraded", Reason: "cloud_403"}, false},
		{"warm", gateway.RouteAnswer{Outcome: "paused", Reason: "allowance"}, false},
		{"warm", gateway.RouteAnswer{Outcome: "paused", Reason: "billing_limit"}, false},
		{"cold", gateway.RouteAnswer{Outcome: "degraded", Reason: "timeout"}, false},
		{"timeout", gateway.RouteAnswer{Outcome: "degraded", Reason: "timeout"}, false},
		{"error", gateway.RouteAnswer{Outcome: "degraded", Reason: "timeout"}, false},
		{"off", gateway.RouteAnswer{Outcome: "degraded", Reason: "timeout"}, false},
	} {
		g := newWarmGateway(t, http.StatusNoContent, tc.engine)
		link := newLink(cloudHome(t, g.URL, true, warmCredentials()))
		cfg := link.settings()
		link.mu.Lock()
		link.started = true
		link.mu.Unlock()
		link.pause(time.Hour, tc.paused)
		link.warm(cfg)
		link.mu.Lock()
		lifted := !link.now().Before(link.pauseUntil)
		link.mu.Unlock()
		if lifted != tc.lifts || g.warms.Load() != 1 {
			t.Errorf("engine %s, pause %s: lifted %v (want %v), warms %d", tc.engine, tc.paused.Reason, lifted, tc.lifts, g.warms.Load())
		}
	}
}

// An origin without the warm feature (a customer install) answers something
// else: never a pause, asks go on as before, and after warmMissMax answers in
// a row the link stops warming until the next login.
func TestNon204WarmIsHarmlessAndBacksOff(t *testing.T) {
	g := newWarmGateway(t, http.StatusBadRequest, "")
	home := cloudHome(t, g.URL, true, warmCredentials())
	link := newLink(home)
	var mu sync.Mutex
	now := time.Now()
	link.now = func() time.Time { mu.Lock(); defer mu.Unlock(); return now }
	link.Start()
	g.waitWarms(t, 1)
	for i := int32(2); i <= warmMissMax+2; i++ {
		mu.Lock()
		now = now.Add(warmQuiet)
		mu.Unlock()
		link.Prime()
		time.Sleep(30 * time.Millisecond)
	}
	if got := g.warms.Load(); got != warmMissMax {
		t.Fatalf("warms = %d, want %d then none", got, warmMissMax)
	}
	link.mu.Lock()
	paused := link.now().Before(link.pauseUntil)
	link.mu.Unlock()
	if paused {
		t.Fatal("a non-204 warm paused routing")
	}
	if answer := link.Ask(t.Context(), messagesAsk("claude-opus-5-5"))(); answer.Model != "claude-sonnet-5-5" {
		t.Fatalf("ask after non-204 warms = %+v", answer)
	}
	time.Sleep(5 * time.Millisecond)
	if err := os.WriteFile(filepath.Join(home, "credentials"), []byte(strings.Replace(warmCredentials(), warmKey, warmKey+"_2", 1)), 0o600); err != nil {
		t.Fatal(err)
	}
	link.settings() // a new login warms again
	g.waitWarms(t, warmMissMax+1)
}

// The link's own transport keeps connections for the asks: HTTP/2 tried,
// idle connections held at least 10 min, proxies from the environment.
func TestLinkTransportKeepsConnections(t *testing.T) {
	transport, ok := New(t.TempDir(), nil).client.Transport.(*http.Transport)
	if !ok || !transport.ForceAttemptHTTP2 || transport.IdleConnTimeout < 10*time.Minute || transport.MaxIdleConnsPerHost < 2 || transport.Proxy == nil ||
		transport.HTTP2 == nil || transport.HTTP2.SendPingTimeout <= 0 || transport.HTTP2.PingTimeout <= 0 {
		t.Fatalf("transport = %+v", transport)
	}
}
