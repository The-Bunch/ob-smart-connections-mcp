#!/usr/bin/env node
import { Command } from 'commander';
import { connectionCommand } from './commands/connection.js';
import { lookupCommand } from './commands/lookup.js';
import { statsCommand } from './commands/stats.js';
import { validateCommand } from './commands/validate.js';

const program = new Command();

program
  .name('smart-cli')
  .description('CLI tool for Smart Connections - find semantic connections in your Obsidian vault')
  .version('1.0.0');

program
  .command('connection <note-path>')
  .description('Find notes semantically similar to the specified note')
  .option('--vault <path>', 'Path to Obsidian vault (or use OBSIDIAN_VAULT env var)')
  .option('--format <type>', 'Output format: plaintext or json', 'plaintext')
  .option('--limit <number>', 'Maximum number of results', '20')
  .option('--verbose', 'Show detailed information about the connection process')
  .action(connectionCommand);

program
  .command('lookup <query>')
  .description('Perform semantic search using query embeddings to find relevant notes')
  .option('--vault <path>', 'Path to Obsidian vault (or use OBSIDIAN_VAULT env var)')
  .option('--format <type>', 'Output format: plaintext or json', 'plaintext')
  .option('--limit <number>', 'Maximum number of results', '20')
  .option('--skip-blocks', 'Exclude block-level results from search')
  .option('--verbose', 'Show detailed information about the search process')
  .action(lookupCommand);

program
  .command('stats')
  .description('Show embedding statistics for the vault')
  .option('--vault <path>', 'Path to Obsidian vault (or use OBSIDIAN_VAULT env var)')
  .option('--format <type>', 'Output format: plaintext or json', 'plaintext')
  .action(statsCommand);

program
  .command('validate')
  .description('Validate Smart Connections data integrity')
  .option('--vault <path>', 'Path to Obsidian vault (or use OBSIDIAN_VAULT env var)')
  .option('--format <type>', 'Output format: plaintext or json', 'plaintext')
  .action(validateCommand);

program.parse();
