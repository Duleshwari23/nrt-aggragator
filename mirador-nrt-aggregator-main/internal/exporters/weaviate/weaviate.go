package weaviate

import (
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"text/template"
	"time"

	"github.com/platformbuilds/mirador-nrt-aggregator/internal/config"
	"github.com/platformbuilds/mirador-nrt-aggregator/internal/model"
)

type Exporter struct {
	endpoint   string
	class      string
	idTemplate *template.Template
	client     *http.Client
}

// New creates a new Weaviate exporter from config.
func New(cfg config.ExporterCfg) *Exporter {
	tmpl := "{{.Service}}:{{.WindowStart}}:{{.SummaryText}}"
	if cfg.IDTemplate != "" {
		tmpl = cfg.IDTemplate
	}
	tt, err := template.New("id").Parse(tmpl)
	if err != nil {
		log.Fatalf("weaviate exporter: invalid id_template: %v", err)
	}
	return &Exporter{
		endpoint:   strings.TrimSuffix(cfg.Endpoint, "/"),
		class:      cfg.Class,
		idTemplate: tt,
		client:     &http.Client{Timeout: 10 * time.Second},
	}
}

// Start runs the exporter, consuming Aggregates until the input channel closes.
func (e *Exporter) Start(ctx context.Context, in <-chan model.Aggregate) error {
	for {
		select {
		case <-ctx.Done():
			return nil
		case a, ok := <-in:
			if !ok {
				return nil
			}
			if err := e.upsert(ctx, a); err != nil {
				log.Printf("weaviate exporter: upsert failed: %v", err)
			}
		}
	}
}

// upsert builds a Weaviate object and sends it to /v1/objects.
func (e *Exporter) upsert(ctx context.Context, a model.Aggregate) error {
	rawID := e.renderID(a)
	id := toUUID5(rawID)

	// Serialize labels map to JSON string (Weaviate text field)
	labelsJSON := "{}"
	if a.Labels != nil {
		if lb, err := json.Marshal(a.Labels); err == nil {
			labelsJSON = string(lb)
		}
	}

	body := map[string]any{
		"class":  e.class,
		"id":     id,
		"vector": a.Vector,
		"properties": map[string]any{
			"summary":       a.SummaryText,
			"service":       a.Service,
			"window_start":  a.WindowStart,
			"window_end":    a.WindowEnd,
			"p50":           a.P50,
			"p95":           a.P95,
			"p99":           a.P99,
			"rps":           a.RPS,
			"error_rate":    a.ErrorRate,
			"anomaly_score": a.AnomalyScore,
			"count":         a.Count,
			"labels":        labelsJSON,
			"locator":       a.Locator,
		},
	}
	b, _ := json.Marshal(body)

	req, _ := http.NewRequestWithContext(ctx, "POST", e.endpoint+"/v1/objects", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	resp, err := e.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	// Handle already exists (409 or 422) gracefully.
	if resp.StatusCode == 409 || resp.StatusCode == 422 {
		io.Copy(io.Discard, resp.Body)
		return nil
	}
	if resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("weaviate HTTP %d: %s", resp.StatusCode, string(respBody))
	}
	io.Copy(io.Discard, resp.Body)
	return nil
}

func (e *Exporter) renderID(a model.Aggregate) string {
	var sb strings.Builder
	if err := e.idTemplate.Execute(&sb, a); err != nil {
		// fallback
		return fmt.Sprintf("%s:%d", a.Service, a.WindowStart)
	}
	return sb.String()
}

// toUUID5 generates a deterministic UUID v5 from the given name string
// using the DNS namespace (any fixed namespace would work).
func toUUID5(name string) string {
	// UUID v5 namespace (DNS): 6ba7b810-9dad-11d1-80b4-00c04fd430c8
	namespace := [16]byte{
		0x6b, 0xa7, 0xb8, 0x10, 0x9d, 0xad, 0x11, 0xd1,
		0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8,
	}
	h := sha1.New()
	h.Write(namespace[:])
	h.Write([]byte(name))
	sum := h.Sum(nil)

	// Set version 5
	sum[6] = (sum[6] & 0x0f) | 0x50
	// Set variant to RFC 4122
	sum[8] = (sum[8] & 0x3f) | 0x80

	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		sum[0:4], sum[4:6], sum[6:8], sum[8:10], sum[10:16])
}
