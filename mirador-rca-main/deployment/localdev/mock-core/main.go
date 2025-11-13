package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
)

type seriesPoint struct {
	Timestamp time.Time `json:"timestamp"`
	Value     float64   `json:"value"`
}

type logEntry struct {
	Timestamp time.Time `json:"timestamp"`
	Message   string    `json:"message"`
	Severity  string    `json:"severity"`
	Count     int       `json:"count"`
}

type traceSpan struct {
	TraceID    string    `json:"trace_id"`
	SpanID     string    `json:"span_id"`
	Service    string    `json:"service"`
	Operation  string    `json:"operation"`
	DurationMs float64   `json:"duration_ms"`
	Status     string    `json:"status"`
	Timestamp  time.Time `json:"timestamp"`
}

type serviceGraphEdge struct {
	Source    string  `json:"source"`
	Target    string  `json:"target"`
	CallRate  float64 `json:"call_rate"`
	ErrorRate float64 `json:"error_rate"`
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	mux.HandleFunc("/api/v1/rca/metrics", func(w http.ResponseWriter, r *http.Request) {
		if !enforcePost(w, r) {
			return
		}
		writeJSON(w, map[string]any{
			"series": []seriesPoint{
				{Timestamp: time.Now().Add(-4 * time.Minute), Value: 1.0},
				{Timestamp: time.Now().Add(-3 * time.Minute), Value: 5.5},
				{Timestamp: time.Now().Add(-2 * time.Minute), Value: 9.2},
			},
		})
	})

	mux.HandleFunc("/api/v1/rca/logs", func(w http.ResponseWriter, r *http.Request) {
		if !enforcePost(w, r) {
			return
		}
		writeJSON(w, map[string]any{
			"entries": []logEntry{
				{Timestamp: time.Now().Add(-3 * time.Minute), Message: "checkout failed to reach payments", Severity: "error", Count: 42},
				{Timestamp: time.Now().Add(-2 * time.Minute), Message: "retry exhausted", Severity: "warn", Count: 7},
			},
		})
	})

	mux.HandleFunc("/api/v1/rca/traces", func(w http.ResponseWriter, r *http.Request) {
		if !enforcePost(w, r) {
			return
		}
		writeJSON(w, map[string]any{
			"spans": []traceSpan{
				{
					TraceID:    "trace-abc",
					SpanID:     "span-1",
					Service:    "checkout",
					Operation:  "HTTP POST /payments",
					DurationMs: 950,
					Status:     "error",
					Timestamp:  time.Now().Add(-90 * time.Second),
				},
				{
					TraceID:    "trace-abc",
					SpanID:     "span-2",
					Service:    "payments",
					Operation:  "DB update",
					DurationMs: 740,
					Status:     "ok",
					Timestamp:  time.Now().Add(-80 * time.Second),
				},
			},
		})
	})

	mux.HandleFunc("/api/v1/rca/service-graph", func(w http.ResponseWriter, r *http.Request) {
		if !enforcePost(w, r) {
			return
		}
		writeJSON(w, map[string]any{
			"edges": []serviceGraphEdge{
				{Source: "checkout", Target: "payments", CallRate: 320.0, ErrorRate: 0.07},
				{Source: "checkout", Target: "inventory", CallRate: 110.0, ErrorRate: 0.02},
			},
		})
	})

	logger := log.New(log.Writer(), "core-mock ", log.LstdFlags|log.Lmicroseconds)
	srv := &http.Server{
		Addr:    ":8080",
		Handler: logRequests(logger, mux),
	}

	logger.Println("listening on :8080")
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		logger.Fatalf("server error: %v", err)
	}
}

func enforcePost(w http.ResponseWriter, r *http.Request) bool {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, payload any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("encode error: %v", err)
	}
}

func logRequests(logger *log.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &responseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rw, r)
		logger.Printf("%s %s %d %s", r.Method, r.URL.Path, rw.status, time.Since(start))
	})
}

type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
}
