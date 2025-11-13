package patterns

import (
	"context"

	"github.com/miradorstack/mirador-rca/internal/models"
)

// StoreFunc adapts a function to the Store interface.
type StoreFunc func(ctx context.Context, tenantID string, patterns []models.FailurePattern) error

// StorePatterns implements Store.
func (f StoreFunc) StorePatterns(ctx context.Context, tenantID string, patterns []models.FailurePattern) error {
	return f(ctx, tenantID, patterns)
}
