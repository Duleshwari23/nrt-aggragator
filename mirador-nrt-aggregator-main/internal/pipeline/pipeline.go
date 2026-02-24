package pipeline

import (
	"context"
	"fmt"
	"log"
	"sync"

	"github.com/platformbuilds/mirador-nrt-aggregator/internal/config"
	"github.com/platformbuilds/mirador-nrt-aggregator/internal/exporters/weaviate"
	"github.com/platformbuilds/mirador-nrt-aggregator/internal/model"

	// Receivers
	jl "github.com/platformbuilds/mirador-nrt-aggregator/internal/receivers/jsonlogs"
	"github.com/platformbuilds/mirador-nrt-aggregator/internal/receivers/kafka"
	"github.com/platformbuilds/mirador-nrt-aggregator/internal/receivers/otlpgrpc"
	"github.com/platformbuilds/mirador-nrt-aggregator/internal/receivers/otlphttp"
	"github.com/platformbuilds/mirador-nrt-aggregator/internal/receivers/promrw"
	"github.com/platformbuilds/mirador-nrt-aggregator/internal/receivers/pulsar"

	// Processors
	"github.com/platformbuilds/mirador-nrt-aggregator/internal/processors/filter"
	"github.com/platformbuilds/mirador-nrt-aggregator/internal/processors/iforest"
	"github.com/platformbuilds/mirador-nrt-aggregator/internal/processors/logsum"
	"github.com/platformbuilds/mirador-nrt-aggregator/internal/processors/otlplogs"
	"github.com/platformbuilds/mirador-nrt-aggregator/internal/processors/spanmetrics"
	"github.com/platformbuilds/mirador-nrt-aggregator/internal/processors/summarizer"
	"github.com/platformbuilds/mirador-nrt-aggregator/internal/processors/vectorizer"
)

// Interface contracts
type Receiver interface {
	Start(ctx context.Context, out chan<- model.Envelope) error
}

type Processor interface {
	Start(ctx context.Context, in <-chan any, out chan<- any) error
}

type Exporter interface {
	Start(ctx context.Context, in <-chan model.Aggregate) error
}

// BuildAndRun builds all configured pipelines and runs them until ctx is canceled.
// Receivers that are referenced by multiple pipelines are started ONCE and
// their output is fanned-out to every subscribing pipeline's channel.
func BuildAndRun(ctx context.Context, cfg *config.Config) error {
	// Build receiver/processor/exporter factories from config
	rxFactory, err := buildReceivers(cfg)
	if err != nil {
		return err
	}

	// ---- Phase 1: Start each receiver ONCE and set up fan-out ----
	// Collect which pipelines subscribe to which receiver key.
	type rxSub struct {
		ch   chan model.Envelope
		name string // pipeline name (for logging)
	}
	rxSubs := map[string][]rxSub{} // receiver key -> list of subscriber channels

	// Prepare per-pipeline receiver input channels
	pipelineInputs := map[string]chan model.Envelope{}
	for pname, p := range cfg.Pipelines {
		ch := make(chan model.Envelope, 64)
		pipelineInputs[pname] = ch
		for _, rkey := range p.Receivers {
			rxSubs[rkey] = append(rxSubs[rkey], rxSub{ch: ch, name: pname})
		}
	}

	// Start each receiver once with a shared output channel
	for rkey, subs := range rxSubs {
		r, ok := rxFactory[rkey]
		if !ok {
			return fmt.Errorf("receiver %q not found", rkey)
		}
		shared := make(chan model.Envelope, 64)
		go func(label string, rr Receiver) {
			if err := rr.Start(ctx, shared); err != nil {
				log.Printf("[receiver:%s] error: %v", label, err)
			}
		}(rkey, r)

		// Fan-out: broadcast from shared channel to all subscriber channels.
		// Each subscriber gets a deep-copy of the Envelope bytes to prevent
		// data races when multiple pipelines unmarshal the same protobuf slice.
		go func(label string, subscribers []rxSub) {
			for env := range shared {
				for i, sub := range subscribers {
					e := env
					if i > 0 {
						// Copy byte slice for all subscribers after the first
						cp := make([]byte, len(env.Bytes))
						copy(cp, env.Bytes)
						e.Bytes = cp
					}
					select {
					case sub.ch <- e:
					case <-ctx.Done():
						return
					}
				}
			}
			// When the shared channel is closed, close all subscriber channels
			for _, sub := range subscribers {
				close(sub.ch)
			}
		}(rkey, subs)
	}

	// ---- Phase 2: Start each pipeline (processors + exporters) ----
	// Each pipeline gets its OWN processor and exporter instances to avoid
	// shared state / concurrent mutation (e.g. two summarizers writing to the
	// same t-digest).
	var wg sync.WaitGroup
	errCh := make(chan error, len(cfg.Pipelines))

	for pname, p := range cfg.Pipelines {
		pname, p := pname, p
		rxCh := pipelineInputs[pname]

		// Build fresh processor instances for this pipeline
		pipelineProcs, err := buildProcessors(cfg)
		if err != nil {
			return err
		}
		// Build fresh exporter instances for this pipeline
		pipelineExps, err := buildExporters(cfg)
		if err != nil {
			return err
		}

		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := runSinglePipeline(ctx, pname, p, rxCh, pipelineProcs, pipelineExps); err != nil {
				select {
				case errCh <- fmt.Errorf("pipeline %q: %w", pname, err):
				default:
				}
			}
		}()
	}

	// Wait for all pipelines; if any error was reported, return the first.
	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()

	select {
	case <-ctx.Done():
		<-done
		return nil
	case err := <-errCh:
		<-done
		return err
	}
}

func runSinglePipeline(
	ctx context.Context,
	name string,
	pl config.PipelineCfg,
	rxOut <-chan model.Envelope,
	procFactory map[string]Processor,
	expFactory map[string]Exporter,
) error {
	log.Printf("[pipeline:%s] starting", name)

	// Receivers are already started by BuildAndRun; rxOut is our input channel.

	// Stage 2..N: Processors
	var inAny <-chan any = envelopeToAny(rxOut)
	for _, pkey := range pl.Processors {
		p, ok := procFactory[pkey]
		if !ok {
			return fmt.Errorf("processor %q not found", pkey)
		}
		outAny := make(chan any)
		go func(label string, pp Processor, in <-chan any, out chan<- any) {
			if err := pp.Start(ctx, in, out); err != nil {
				log.Printf("[processor:%s] error: %v", label, err)
			}
		}(pkey, p, inAny, outAny)
		inAny = outAny
	}

	// Stage N+1: Exporters (fan-out)
	finalAgg := make(chan model.Aggregate)
	// bridge: any -> aggregate
	go func() {
		defer close(finalAgg)
		for v := range inAny {
			if a, ok := v.(model.Aggregate); ok {
				finalAgg <- a
			}
		}
	}()

	// Fan-out to all exporters
	if len(pl.Exporters) == 0 {
		log.Printf("[pipeline:%s] no exporters; aggregates will be dropped", name)
	} else {
		var expWg sync.WaitGroup
		expInputs := make([]chan model.Aggregate, 0, len(pl.Exporters))
		for _, ekey := range pl.Exporters {
			e, ok := expFactory[ekey]
			if !ok {
				return fmt.Errorf("exporter %q not found", ekey)
			}
			ch := make(chan model.Aggregate)
			expInputs = append(expInputs, ch)

			expWg.Add(1)
			go func(label string, ee Exporter, in <-chan model.Aggregate) {
				defer expWg.Done()
				if err := ee.Start(ctx, in); err != nil {
					log.Printf("[exporter:%s] error: %v", label, err)
				}
			}(ekey, e, ch)
		}

		// Dispatcher reads finalAgg and broadcasts to each exporter input
		go func() {
			defer func() {
				for _, ch := range expInputs {
					close(ch)
				}
			}()
			for a := range finalAgg {
				for _, ch := range expInputs {
					select {
					case ch <- a:
					case <-ctx.Done():
						return
					}
				}
			}
		}()

		// Wait for exporters to finish when context is canceled and finalAgg drained
		go func() {
			<-ctx.Done()
			expWg.Wait()
			log.Printf("[pipeline:%s] exporters stopped", name)
		}()
	}

	// Block until context canceled
	<-ctx.Done()
	log.Printf("[pipeline:%s] stopped", name)
	return nil
}

// envelopeToAny converts a typed channel to a generic any channel for processor chaining.
func envelopeToAny(in <-chan model.Envelope) <-chan any {
	out := make(chan any)
	go func() {
		for v := range in {
			out <- v
		}
		close(out)
	}()
	return out
}

// ---- Factory builders ----

func buildReceivers(cfg *config.Config) (map[string]Receiver, error) {
	rx := make(map[string]Receiver, len(cfg.Receivers))
	for key, rc := range cfg.Receivers {
		var r Receiver
		switch rc.Type {
		case "otlpgrpc":
			r = otlpgrpc.New(rc)
		case "otlphttp":
			r = otlphttp.New(rc)
		case "kafka":
			// Default kind "metrics" unless overridden via Extra["kind"]
			kind := "metrics"
			if v, ok := rc.Extra["kind"].(string); ok && v != "" {
				kind = v
			}
			r = kafka.New(rc, kind)
		case "pulsar":
			kind := "metrics"
			if v, ok := rc.Extra["kind"].(string); ok && v != "" {
				kind = v
			}
			r = pulsar.New(rc, kind)
		case "promremotewrite", "promrw":
			r = promrw.New(rc)
		case "jsonlogs":
			// Subtype via rc.Name: "http" or "kafka"
			switch rc.Name {
			case "http":
				r = jl.NewHTTP(rc)
			case "kafka":
				r = jl.NewKafka(rc)
			default:
				return nil, fmt.Errorf("jsonlogs receiver name %q not supported (want http|kafka)", rc.Name)
			}
		default:
			return nil, fmt.Errorf("unknown receiver type %q (key=%s)", rc.Type, key)
		}
		rx[key] = r
	}
	return rx, nil
}

func buildProcessors(cfg *config.Config) (map[string]Processor, error) {
	proc := make(map[string]Processor, len(cfg.Processors))
	for key, pc := range cfg.Processors {
		var p Processor
		switch pc.Type {
		case "spanmetrics":
			p = spanmetrics.New(pc)
		case "summarizer":
			p = summarizer.New(pc)
		case "iforest":
			p = iforest.New(pc)
		case "vectorizer":
			p = vectorizer.New(pc)
		case "logsum":
			p = logsum.New(pc)
		case "otlplogs":
			p = otlplogs.New(pc)
		case "filter":
			p = filter.New(pc)
		default:
			return nil, fmt.Errorf("unknown processor type %q (key=%s)", pc.Type, key)
		}
		proc[key] = p
	}
	return proc, nil
}

func buildExporters(cfg *config.Config) (map[string]Exporter, error) {
	exp := make(map[string]Exporter, len(cfg.Exporters))
	for key, ec := range cfg.Exporters {
		var e Exporter
		switch ec.Type {
		case "weaviate":
			e = weaviate.New(ec)
		default:
			return nil, fmt.Errorf("unknown exporter type %q (key=%s)", ec.Type, key)
		}
		exp[key] = e
	}
	return exp, nil
}
