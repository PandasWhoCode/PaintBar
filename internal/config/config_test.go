package config

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoad_Defaults(t *testing.T) {
	// Clear env to test defaults
	os.Unsetenv("ENV")
	os.Unsetenv("PORT")
	os.Unsetenv("FIREBASE_PROJECT_ID")

	cfg, err := Load()
	require.NoError(t, err)

	assert.Equal(t, EnvLocal, cfg.Env)
	assert.Equal(t, "8080", cfg.Port)
	assert.Equal(t, "paintbar-7f887", cfg.FirebaseProjectID)
	assert.True(t, cfg.IsLocal())
	assert.False(t, cfg.IsProduction())
}

func TestLoad_LocalAutoConfiguresEmulators(t *testing.T) {
	os.Setenv("ENV", "local")
	defer os.Unsetenv("ENV")

	cfg, err := Load()
	require.NoError(t, err)

	assert.Equal(t, "localhost:8081", cfg.FirestoreEmulatorHost)
	assert.Equal(t, "localhost:9099", cfg.FirebaseAuthEmulatorHost)
	assert.Equal(t, "local", cfg.HieroNetwork)
}

func TestLoad_InvalidEnv(t *testing.T) {
	os.Setenv("ENV", "staging")
	defer os.Unsetenv("ENV")

	_, err := Load()
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "invalid ENV")
}

func TestLoad_ProductionAllowsADC(t *testing.T) {
	os.Setenv("ENV", "production")
	os.Setenv("FIREBASE_SERVICE_ACCOUNT_PATH", "")
	defer func() {
		os.Unsetenv("ENV")
		os.Unsetenv("FIREBASE_SERVICE_ACCOUNT_PATH")
	}()

	cfg, err := Load()
	require.NoError(t, err)
	assert.True(t, cfg.IsProduction())
	assert.Empty(t, cfg.FirebaseServiceAccountPath)
}

func TestLoad_ProductionDoesNotRequireHieroCredentials(t *testing.T) {
	os.Setenv("ENV", "production")
	os.Setenv("HIERO_OPERATOR_ID", "")
	os.Setenv("HIERO_OPERATOR_KEY", "")
	defer func() {
		os.Unsetenv("ENV")
		os.Unsetenv("HIERO_OPERATOR_ID")
		os.Unsetenv("HIERO_OPERATOR_KEY")
	}()

	cfg, err := Load()
	require.NoError(t, err)
	assert.True(t, cfg.IsProduction())
}

func TestLoad_CustomPort(t *testing.T) {
	os.Setenv("PORT", "3000")
	defer os.Unsetenv("PORT")

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, "3000", cfg.Port)
}

func TestLoad_EmptyPort(t *testing.T) {
	os.Setenv("PORT", "")
	defer os.Unsetenv("PORT")

	_, err := Load()
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "PORT is required")
}

func TestLoad_EmptyFirebaseProjectID(t *testing.T) {
	os.Setenv("FIREBASE_PROJECT_ID", "")
	defer os.Unsetenv("FIREBASE_PROJECT_ID")

	_, err := Load()
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "FIREBASE_PROJECT_ID is required")
}

func TestLoad_PreviewUsesADC(t *testing.T) {
	os.Setenv("ENV", "preview")
	os.Setenv("FIREBASE_SERVICE_ACCOUNT_PATH", "")
	defer func() {
		os.Unsetenv("ENV")
		os.Unsetenv("FIREBASE_SERVICE_ACCOUNT_PATH")
	}()

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, EnvPreview, cfg.Env)
	assert.Empty(t, cfg.FirebaseServiceAccountPath)
}

func TestLoad_LocalWithPresetEmulatorHosts(t *testing.T) {
	os.Setenv("ENV", "local")
	os.Setenv("FIRESTORE_EMULATOR_HOST", "custom:9090")
	os.Setenv("FIREBASE_AUTH_EMULATOR_HOST", "custom:9091")
	defer func() {
		os.Unsetenv("ENV")
		os.Unsetenv("FIRESTORE_EMULATOR_HOST")
		os.Unsetenv("FIREBASE_AUTH_EMULATOR_HOST")
	}()

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, "custom:9090", cfg.FirestoreEmulatorHost)
	assert.Equal(t, "custom:9091", cfg.FirebaseAuthEmulatorHost)
}

func TestLoad_LocalWithEmptyHieroNetwork(t *testing.T) {
	os.Setenv("ENV", "local")
	os.Setenv("HIERO_NETWORK", "")
	defer func() {
		os.Unsetenv("ENV")
		os.Unsetenv("HIERO_NETWORK")
	}()

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, "local", cfg.HieroNetwork)
}

func TestLoad_ProductionValid(t *testing.T) {
	os.Setenv("ENV", "production")
	defer os.Unsetenv("ENV")

	cfg, err := Load()
	require.NoError(t, err)
	assert.True(t, cfg.IsProduction())
	assert.False(t, cfg.IsLocal())
}
