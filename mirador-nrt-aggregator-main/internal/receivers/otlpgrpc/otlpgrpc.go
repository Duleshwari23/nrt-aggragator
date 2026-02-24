package otlpgrpc

import (
        "context"
        "log"
        "net"
        "time"

        "github.com/platformbuilds/mirador-nrt-aggregator/internal/config"
        "github.com/platformbuilds/mirador-nrt-aggregator/internal/model"

        colllog "go.opentelemetry.io/proto/otlp/collector/logs/v1"
        collmet "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
        "google.golang.org/grpc"
        "google.golang.org/grpc/reflection"
        "google.golang.org/protobuf/proto"

        _ "google.golang.org/grpc/encoding/gzip"
)

type Receiver struct {
        endpoint string
}

func New(rc config.ReceiverCfg) *Receiver {
        return &Receiver{endpoint: rc.Endpoint}
}

func (r *Receiver) Start(ctx context.Context, out chan<- model.Envelope) error {
        addr := r.endpoint
        if addr == "" { addr = ":4317" }
        lis, err := net.Listen("tcp", addr)
        if err != nil {
                log.Printf("[otlpgrpc] failed to listen on %s: %v", addr, err)
                return err
        }
        
        log.Printf("[otlpgrpc] listening on gRPC://%s", addr)

        srv := grpc.NewServer()

        // Only Register Metrics and Logs
        collmet.RegisterMetricsServiceServer(srv, &metricsSvc{out: out})
        colllog.RegisterLogsServiceServer(srv, &logsSvc{out: out})

        reflection.Register(srv)

        go func() {
                log.Printf("[otlpgrpc] starting gRPC server on %s", addr)
                if err := srv.Serve(lis); err != nil {
                        log.Printf("[otlpgrpc] serve error: %v", err)
                }
        }()

        <-ctx.Done()
        srv.GracefulStop()
        return nil
}

type metricsSvc struct {
        collmet.UnimplementedMetricsServiceServer
        out chan<- model.Envelope
}

func (s *metricsSvc) Export(ctx context.Context, req *collmet.ExportMetricsServiceRequest) (*collmet.ExportMetricsServiceResponse, error) {
        b, _ := proto.Marshal(req)
        s.out <- model.Envelope{Kind: model.KindMetrics, Bytes: b, TSUnix: time.Now().Unix()}
        return &collmet.ExportMetricsServiceResponse{}, nil
}

type logsSvc struct {
        colllog.UnimplementedLogsServiceServer
        out chan<- model.Envelope
}

func (s *logsSvc) Export(ctx context.Context, req *colllog.ExportLogsServiceRequest) (*colllog.ExportLogsServiceResponse, error) {
        b, _ := proto.Marshal(req)
        s.out <- model.Envelope{Kind: model.KindJSONLogs, Bytes: b, TSUnix: time.Now().Unix()}
        return &colllog.ExportLogsServiceResponse{}, nil
}
