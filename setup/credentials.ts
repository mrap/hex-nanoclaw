/**
 * Step: credentials — Install OneCLI, configure it, and register the Anthropic API key.
 * Handles OneCLI gateway deployment, CLI installation, and credential vault setup.
 */
import { execSync } from 'child_process';
import os from 'os';
import path from 'path';

import { OneCLI } from '@onecli-sh/sdk';

import { readEnvFile } from '../src/env.js';
import { logger } from '../src/logger.js';
import { emitStatus } from './status.js';

const GATEWAY_URL = 'http://127.0.0.1:10254';
const HEALTH_ENDPOINT = `${GATEWAY_URL}/api/health`;
const ONECLI_CLI_PATH = path.join(os.homedir(), '.local', 'bin', 'onecli');
const READINESS_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;

function isGatewayHealthy(): boolean {
  try {
    execSync(`curl -sf ${HEALTH_ENDPOINT}`, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

function isDockerRunning(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

function findOnecliCli(): string | null {
  // Check explicit path first
  try {
    execSync(`${ONECLI_CLI_PATH} version`, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5_000,
    });
    return ONECLI_CLI_PATH;
  } catch {
    // not at explicit path
  }
  // Check PATH
  try {
    const resolved = execSync('command -v onecli', {
      encoding: 'utf-8',
      timeout: 5_000,
    }).trim();
    if (resolved) return resolved;
  } catch {
    // not in PATH
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function run(_args: string[]): Promise<void> {
  let gatewayRunning = false;
  let cliInstalled = false;
  let anthropicRegistered = false;

  // Phase 1: Check if OneCLI gateway is already running
  logger.info('Checking OneCLI gateway health');
  gatewayRunning = isGatewayHealthy();
  if (gatewayRunning) {
    logger.info('OneCLI gateway is already running');
  }

  // Phase 2: Install OneCLI gateway if not running
  if (!gatewayRunning) {
    if (!isDockerRunning()) {
      logger.error(
        'Docker is not running. OneCLI gateway requires Docker. Please start Docker and retry.',
      );
      emitStatus('CREDENTIALS', {
        GATEWAY_RUNNING: false,
        CLI_INSTALLED: false,
        ANTHROPIC_REGISTERED: false,
        STATUS: 'failed',
        ERROR: 'docker_not_running',
      });
      return;
    }

    logger.info('Installing OneCLI gateway via Docker Compose');
    try {
      execSync('curl -fsSL onecli.sh/install | sh', {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120_000,
      });
      logger.info('OneCLI gateway install command completed');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'OneCLI gateway installation failed');
      emitStatus('CREDENTIALS', {
        GATEWAY_RUNNING: false,
        CLI_INSTALLED: false,
        ANTHROPIC_REGISTERED: false,
        STATUS: 'failed',
        ERROR: `gateway_install_failed: ${message}`,
      });
      return;
    }
  }

  // Phase 3: Install OneCLI CLI if not found
  let cliPath = findOnecliCli();
  if (cliPath) {
    cliInstalled = true;
    logger.info({ path: cliPath }, 'OneCLI CLI already installed');
  } else {
    logger.info('Installing OneCLI CLI');
    try {
      execSync('curl -fsSL onecli.sh/cli/install | sh', {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60_000,
      });
      cliPath = findOnecliCli();
      if (cliPath) {
        cliInstalled = true;
        logger.info({ path: cliPath }, 'OneCLI CLI installed');
      } else {
        logger.error('OneCLI CLI not found after installation');
      }
    } catch (err) {
      logger.error({ err }, 'OneCLI CLI installation failed');
    }
  }

  // Phase 4: Configure CLI to use local gateway
  if (cliInstalled && cliPath) {
    logger.info('Configuring OneCLI CLI to use local gateway');
    try {
      execSync(`${cliPath} config set api-host ${GATEWAY_URL}`, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 10_000,
      });
      logger.info('OneCLI CLI configured');
    } catch (err) {
      logger.warn({ err }, 'Failed to configure OneCLI CLI api-host');
    }
  }

  // Phase 5: Wait for gateway readiness (up to 30 seconds)
  if (!gatewayRunning) {
    logger.info('Waiting for OneCLI gateway to become ready');
    const deadline = Date.now() + READINESS_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (isGatewayHealthy()) {
        gatewayRunning = true;
        logger.info('OneCLI gateway is ready');
        break;
      }
      await sleep(POLL_INTERVAL_MS);
    }
    if (!gatewayRunning) {
      logger.error('OneCLI gateway did not become ready within timeout');
      emitStatus('CREDENTIALS', {
        GATEWAY_RUNNING: false,
        CLI_INSTALLED: cliInstalled,
        ANTHROPIC_REGISTERED: false,
        STATUS: 'failed',
        ERROR: 'gateway_readiness_timeout',
      });
      return;
    }
  }

  // Phase 6: Register Anthropic API key
  const env = readEnvFile(['ANTHROPIC_API_KEY']);
  const apiKey = env['ANTHROPIC_API_KEY'];

  if (apiKey && cliInstalled && cliPath) {
    logger.info('Registering Anthropic API key with OneCLI');
    try {
      execSync(
        `${cliPath} secrets create --name Anthropic --type anthropic --value ${apiKey} --host-pattern api.anthropic.com`,
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 15_000,
        },
      );
      anthropicRegistered = true;
      logger.info('Anthropic API key registered');
    } catch (err) {
      logger.warn({ err }, 'Failed to register Anthropic API key');
    }
  } else if (!apiKey) {
    logger.warn(
      'ANTHROPIC_API_KEY not found in .env — skipping credential registration',
    );
  }

  // Phase 7: Verify credential injection works
  if (gatewayRunning) {
    logger.info('Verifying OneCLI credential injection');
    try {
      const onecli = new OneCLI({ url: GATEWAY_URL });
      const config = await onecli.getContainerConfig();
      if (config.env && config.caCertificate) {
        logger.info('OneCLI credential injection verified');
      } else {
        logger.warn('OneCLI returned config but missing expected fields');
      }
    } catch (err) {
      logger.warn({ err }, 'OneCLI credential injection verification failed');
    }
  }

  // Determine overall status
  const status =
    gatewayRunning && cliInstalled && anthropicRegistered
      ? 'success'
      : gatewayRunning && cliInstalled
        ? 'partial'
        : 'failed';

  emitStatus('CREDENTIALS', {
    GATEWAY_RUNNING: gatewayRunning,
    CLI_INSTALLED: cliInstalled,
    ANTHROPIC_REGISTERED: anthropicRegistered,
    STATUS: status,
  });
}
