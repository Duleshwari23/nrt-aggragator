package utils

import "fmt"

// AppError wraps an operation, human-facing message, and underlying error.
type AppError struct {
	Op  string
	Msg string
	Err error
}

func (e *AppError) Error() string {
	if e.Err == nil {
		return fmt.Sprintf("%s: %s", e.Op, e.Msg)
	}
	return fmt.Sprintf("%s: %s: %v", e.Op, e.Msg, e.Err)
}

func (e *AppError) Unwrap() error {
	return e.Err
}

// NewAppError constructs an AppError.
func NewAppError(op, msg string, err error) error {
	return &AppError{Op: op, Msg: msg, Err: err}
}
