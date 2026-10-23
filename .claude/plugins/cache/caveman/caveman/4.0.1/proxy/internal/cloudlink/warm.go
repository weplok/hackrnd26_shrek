package cloudlink

import (
	"context"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/JuliusBrussee/caveman/proxy/internal/gateway"
)

// The route path kept hot (contract route-warm-v1): a warm is POST
// {gateway}/v1/route with x-cave-warm: 1, the asks' own credential and no
// body. The edge answers 204 and wakes this key's engine for its location
// (Go and the catalog loaded, kept 72 h); it never decides or bills. Only
// x-cave-edge-engine: warm says the engine is warm (timeout, error, cold and
// off are 204s too). Any other status is an origin without the feature (a
// customer install): not warm, never a routing failure, never a pause.
const (
	warmEvery   = time.Minute      // keep-alive interval while asks come
	warmFor     = 15 * time.Minute // ... until this long after the last ask
	warmQuiet   = 30 * time.Second // a session or prompt start warms after this long without contact
	warmMissMax = 3                // non-204 answers in a row: no edge here; off until the next login or start
	warmTimeout = 10 * time.Second // the edge waits up to 5 s for an engine to load
)

// linkTransport carries asks, warms and events on connections kept open: HTTP/2
// when the server speaks it, idle connections held 10 min in a small pool per
// host, so an ask rides a connection a warm or the last ask opened. Proxy from
// the environment and Go's default TLS, as http.DefaultTransport.
func linkTransport() *http.Transport {
	return &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           (&net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          8,
		MaxIdleConnsPerHost:   4,
		IdleConnTimeout:       10 * time.Minute,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: time.Second,
		// An HTTP/2 connection silent for 15 s is pinged and dropped without
		// an answer in 5 s, so one that died in a sleep or a network change is
		// found before an ask rides it.
		HTTP2: &http.HTTP2Config{SendPingTimeout: 15 * time.Second, PingTimeout: 5 * time.Second},
	}
}

// Prime warms the route path when the local runtime learns a session or a
// prompt is starting (native hooks) and nothing reached the gateway for
// warmQuiet, so the connection and the engine are hot before the model
// request arrives. It never blocks.
func (l *Link) Prime() {
	go func() {
		cfg := l.settings()
		l.mu.Lock()
		quiet := l.now().Sub(l.lastContact) >= warmQuiet
		l.mu.Unlock()
		if quiet {
			l.warm(cfg)
		}
	}()
}

// noteAsk records an ask and keeps the route path warm while they come.
func (l *Link) noteAsk() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.lastAsk = l.now()
	if l.started && !l.keeping && !l.warmOff {
		l.keeping = true
		go l.keepWarm()
	}
}

// keepWarm warms every warmEvery without other contact, until warmFor after
// the last ask; one loop at a time.
func (l *Link) keepWarm() {
	for {
		time.Sleep(l.warmEvery)
		cfg := l.settings()
		l.mu.Lock()
		if l.warmOff || l.now().Sub(l.lastAsk) > warmFor {
			l.keeping = false
			l.mu.Unlock()
			return
		}
		quiet := l.now().Sub(l.lastContact) >= l.warmEvery
		l.mu.Unlock()
		if quiet {
			l.warm(cfg)
		}
	}
}

// warm sends one warm, signed in with routing on, one at a time. A warm
// engine ends a pause a slow, unreachable or failing Cloud caused.
func (l *Link) warm(cfg settings) {
	l.mu.Lock()
	if !l.started || l.warming || l.warmOff || !cfg.routing || cfg.offline || !cfg.signedIn() {
		l.mu.Unlock()
		return
	}
	l.warming = true
	l.mu.Unlock()
	status, engine := l.warmCall(cfg)
	l.mu.Lock()
	defer l.mu.Unlock()
	l.warming = false
	switch {
	case status == 0: // no answer: nothing learned
	case status != http.StatusNoContent:
		l.warmMisses++
		l.warmOff = l.warmMisses >= warmMissMax
	default:
		l.warmMisses = 0
		if engine != "warm" {
			return
		}
		l.lastContact = l.now()
		if l.paused.Outcome == "degraded" && transientPause(l.paused.Reason) && l.now().Before(l.pauseUntil) {
			l.pauseUntil, l.paused = time.Time{}, gateway.RouteAnswer{}
		}
	}
}

// transientPause is a pause a warm engine disproves: a timeout, an unreachable
// Cloud or a 5xx. A refused login or a limit holds.
func transientPause(reason string) bool {
	return reason == "timeout" || reason == "cloud_unreachable" || strings.HasPrefix(reason, "cloud_5")
}

// warmCall posts one warm: the status (0 without an answer) and the engine
// state the edge reported.
func (l *Link) warmCall(cfg settings) (int, string) {
	bearer := cfg.gatewayBearer(l.now())
	if bearer == "" {
		return 0, ""
	}
	ctx, cancel := context.WithTimeout(context.Background(), warmTimeout)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.gateway+"/v1/route", nil)
	if err != nil {
		return 0, ""
	}
	request.Header.Set("authorization", "Bearer "+bearer)
	request.Header.Set("x-cave-warm", "1")
	request.Header["X-Idempotency-Key"] = nil // replayable: a dead kept-alive connection is retried on a new one
	response, err := l.client.Do(request)
	if err != nil {
		if l.logger != nil {
			l.logger.Debug("route warm failed", "error", err)
		}
		return 0, ""
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, answerMax))
	response.Body.Close()
	engine := response.Header.Get("x-cave-edge-engine")
	if l.logger != nil {
		l.logger.Debug("route warm", "status", response.StatusCode, "engine", engine, "edge", response.Header.Get("x-cave-edge"))
	}
	return response.StatusCode, engine
}
