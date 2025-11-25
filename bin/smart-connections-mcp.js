#!/usr/bin/env node

// MCP server executable for npx usage
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Run the MCP server from the project root
const serverPath = join(__dirname, '..', 'mcp-server.js');
import(serverPath);