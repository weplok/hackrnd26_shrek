package engine

import (
	"bytes"
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/JuliusBrussee/caveman/engine/ccr"
)

// testdata/codex_exec_code_mode.txt has the shape of a live Codex 0.161 code-mode
// result (2026-10-17): header lines, then one JSON line per exec_command call, the
// first with an empty output, the second carrying the command's 800 log lines.
func codexFixture(t *testing.T) []byte {
	t.Helper()
	in, err := os.ReadFile("testdata/codex_exec_code_mode.txt")
	if err != nil {
		t.Fatal(err)
	}
	return in
}

func TestCodexExecOutputCompressesAndRetrievesTheOriginal(t *testing.T) {
	store, err := ccr.OpenMemory()
	if err != nil {
		t.Fatal(err)
	}
	eng := New(store, nil)
	in := codexFixture(t)
	res, err := eng.Compress(in, Options{Mode: ModeCompress})
	if err != nil {
		t.Fatal(err)
	}
	if res.TokensAfter >= res.TokensBefore || res.RecoveryHandle == "" {
		t.Fatalf("not compressed: %d -> %d, handle %q", res.TokensBefore, res.TokensAfter, res.RecoveryHandle)
	}
	// The header and the first call's line are untouched; the second line is still a valid
	// JSON object whose output keeps the error the model needs.
	lines := strings.Split(string(res.Output), "\n")
	inLines := strings.Split(string(in), "\n")
	for i := range 4 {
		if lines[i] != inLines[i] {
			t.Fatalf("line %d changed: %q", i, lines[i])
		}
	}
	rest := strings.Join(lines[4:], "\n")
	var result struct {
		ChunkID  string `json:"chunk_id"`
		ExitCode int    `json:"exit_code"`
		Output   string `json:"output"`
	}
	if err := json.Unmarshal([]byte(rest), &result); err != nil {
		t.Fatalf("rewrapped line is not JSON: %v\n%s", err, rest)
	}
	if result.ChunkID != "7ae69c" || !strings.Contains(result.Output, "ERROR line 801 disk full") {
		t.Fatalf("result lost its identity or its error: %+v", result.ChunkID)
	}
	// caveman_retrieve hands back the exact original.
	got, err := eng.Retrieve(res.RecoveryHandle)
	if err != nil || !bytes.Equal(got, in) {
		t.Fatalf("retrieve: err %v, equal %v", err, bytes.Equal(got, in))
	}
}

func TestUnwrapCodexExecOnlyTakesCodexResultLines(t *testing.T) {
	in := codexFixture(t)
	// Codex cut the result in the middle: the line no longer parses, the string still does.
	cut := bytes.Replace(in, []byte(`line 300\nINFO`), []byte(`line 300\n…9000 tokens truncated…\nINFO`), 1)
	for _, ok := range [][]byte{in, cut} {
		inner, w := unwrapCodexExec(ok)
		if !w.present || !bytes.HasPrefix(inner, []byte("INFO worker ok line 1\n")) {
			t.Fatalf("not unwrapped: %q", inner[:min(40, len(inner))])
		}
		if !bytes.Equal(w.rewrap(inner), ok) {
			t.Fatal("unwrap then rewrap changed bytes")
		}
	}
	for _, no := range [][]byte{
		[]byte(`{"output":"a plain object, not a command result"}`),
		[]byte(`{"exit_code":0,"output":"x","next":1}`),
		[]byte(`{"exit_code":0,"output":"split escape \"}`),
		[]byte(`{"exit_code":0,"output":""}`),
		[]byte("INFO plain log\nINFO lines\n"),
	} {
		if got, w := unwrapCodexExec(no); w.present || !bytes.Equal(got, no) {
			t.Fatalf("false positive on %q", no)
		}
	}
}
