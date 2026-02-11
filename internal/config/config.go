package config

import (
	"fmt"
	"os"
)

// Environment constants
const (
	EnvLocal      = "local"
	EnvPreview    = "preview"
	EnvProduction = "production"
)

// Config holds all application configuration loaded from environment variables.
type Config struct {
	// Environment: local, preview, production
	Env string

	// HTTP server port
	Port string

	// Firebase
	FirebaseProjectID          string
	FirebaseServiceAccountPath string

	// Firestore emulator (local only, set automatically)
	FirestoreEmulatorHost string

	// Firebase Auth emulator (local only, set automatically)
	FirebaseAuthEmulatorHost string

	// Hiero network configuration
	HieroNetwork     string // local, testnet, mainnet
	HieroOperatorID  string
	HieroOperatorKey string
}

// Load reads configuration from environment variables and validates it.
func Load() (*Config, error) {
	cfg := &Config{
		Env:                        getEnv("ENV", EnvLocal),
		Port:                       getEnv("PORT", "8080"),
		FirebaseProjectID:          getEnv("FIREBASE_PROJECT_ID", "paintbar-7f887"),
		FirebaseServiceAccountPath: getEnv("FIREBASE_SERVICE_ACCOUNT_PATH", ""),
		FirestoreEmulatorHost:      getEnv("FIRESTORE_EMULATOR_HOST", ""),
		FirebaseAuthEmulatorHost:   getEnv("FIREBASE_AUTH_EMULATOR_HOST", ""),
		HieroNetwork:               getEnv("HIERO_NETWORK", "local"),
		HieroOperatorID:            getEnv("HIERO_OPERATOR_ID", ""),
		HieroOperatorKey:           getEnv("HIERO_OPERATOR_KEY", ""),
	}

	// Auto-configure emulator hosts for local environment
	if cfg.Env == EnvLocal {
		if cfg.FirestoreEmulatorHost == "" {
			cfg.FirestoreEmulatorHost = "localhost:8081"
		}
		if cfg.FirebaseAuthEmulatorHost == "" {
			cfg.FirebaseAuthEmulatorHost = "localhost:9099"
		}
		if cfg.HieroNetwork == "" {
			cfg.HieroNetwork = "local"
		}
	}

	if err := cfg.validate(); err != nil {
		return nil, fmt.Errorf("config validation: %w", err)
	}

	return cfg, nil
}

// validate checks that required fields are set for the current environment.
func (c *Config) validate() error {
	validEnvs := map[string]bool{EnvLocal: true, EnvPreview: true, EnvProduction: true}
	if !validEnvs[c.Env] {
		return fmt.Errorf("invalid ENV %q, must be one of: local, preview, production", c.Env)
	}

	if c.Port == "" {
		return fmt.Errorf("PORT is required")
	}

	if c.FirebaseProjectID == "" {
		return fmt.Errorf("FIREBASE_PROJECT_ID is required")
	}

	// Service account required for production (preview uses ADC on Cloud Run)
	if c.Env == EnvProduction && c.FirebaseServiceAccountPath == "" {
		return fmt.Errorf("FIREBASE_SERVICE_ACCOUNT_PATH is required for %s environment", c.Env)
	}

	// Hiero operator credentials required for non-local environments
	if c.Env == EnvProduction {
		if c.HieroOperatorID == "" || c.HieroOperatorKey == "" {
			return fmt.Errorf("HIERO_OPERATOR_ID and HIERO_OPERATOR_KEY are required for production")
		}
	}

	return nil
}

// IsLocal returns true if running in local development mode.
func (c *Config) IsLocal() bool {
	return c.Env == EnvLocal
}

// IsProduction returns true if running in production mode.
func (c *Config) IsProduction() bool {
	return c.Env == EnvProduction
}

func getEnv(key, fallback string) string {
	if val, ok := os.LookupEnv(key); ok {
		return val
	}
	return fallback
}
