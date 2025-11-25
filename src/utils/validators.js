import fs from 'fs';
import path from 'path';

export class SmartCliError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SmartCliError';
    this.code = code;
  }
}

export function validateVaultPath(vaultPath) {
  if (!fs.existsSync(vaultPath)) {
    throw new SmartCliError(
      `Vault not found: ${vaultPath}`,
      'VAULT_NOT_FOUND'
    );
  }

  if (!fs.existsSync(path.join(vaultPath, '.obsidian'))) {
    throw new SmartCliError(
      `Not an Obsidian vault: ${vaultPath}`,
      'INVALID_VAULT'
    );
  }
}

export function validateSmartEnvData(vaultPath) {
  const singleFilePath = path.join(vaultPath, '.smart-env', 'smart_sources.json');
  const multiFilePath = path.join(vaultPath, '.smart-env', 'multi');

  // Check for either single-file or multi-file format
  if (!fs.existsSync(singleFilePath) && !fs.existsSync(multiFilePath)) {
    throw new SmartCliError(
      'Smart Connections data not found.\n' +
      'Please ensure:\n' +
      '  1. Smart Connections plugin is installed in Obsidian\n' +
      '  2. The vault has been indexed (open Obsidian and let it process)\n' +
      `  3. Either ${singleFilePath} or ${multiFilePath} exists`,
      'DATA_NOT_FOUND'
    );
  }
}
