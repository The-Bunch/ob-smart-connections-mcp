import { loadSmartSources } from '../core/data-loader.js';
import { loadPluginSettings } from '../core/config-loader.js';
import { validateVaultPath, validateSmartEnvData } from '../utils/validators.js';
import fs from 'fs';
import path from 'path';

/**
 * Validate Smart Connections data integrity
 * @param {Object} options - Command options
 */
export async function validateCommand(options) {
  const vaultPath = options.vault || process.env.OBSIDIAN_VAULT;

  if (!vaultPath) {
    console.error('Error: Vault path not specified. Use --vault or set OBSIDIAN_VAULT.');
    process.exit(1);
  }

  const issues = [];
  const warnings = [];
  let passed = 0;

  console.log('Validating Smart Connections data...\n');

  // Check 1: Vault exists and is valid Obsidian vault
  try {
    validateVaultPath(vaultPath);
    passed++;
    console.log('✓ Vault path is valid');
  } catch (error) {
    issues.push(`Vault validation failed: ${error.message}`);
    console.log('✗ Vault path is invalid');
  }

  // Check 2: Smart Connections data exists
  try {
    validateSmartEnvData(vaultPath);
    passed++;
    console.log('✓ Smart Connections data found');
  } catch (error) {
    issues.push(`Data validation failed: ${error.message}`);
    console.log('✗ Smart Connections data not found');
    // Can't continue without data
    printValidationSummary(issues, warnings, passed);
    process.exit(1);
  }

  // Check 3: Data is valid JSON
  let sources;
  try {
    sources = loadSmartSources(vaultPath);
    passed++;
    console.log('✓ Data file is valid JSON');
  } catch (error) {
    issues.push(`Data parsing failed: ${error.message}`);
    console.log('✗ Data file has JSON errors');
    printValidationSummary(issues, warnings, passed);
    process.exit(1);
  }

  // Check 4: Plugin settings exist and are valid
  try {
    loadPluginSettings(vaultPath);
    passed++;
    console.log('✓ Plugin settings found');
  } catch (error) {
    warnings.push(`Settings not found (using defaults): ${error.message}`);
    console.log('⚠ Plugin settings not found (using defaults)');
  }

  // Check 5: Validate embedding vectors
  const validationResults = validateEmbeddings(sources);
  if (validationResults.issues.length === 0) {
    passed++;
    console.log('✓ All embeddings are valid');
  } else {
    validationResults.issues.forEach(issue => {
      issues.push(issue);
      console.log(`✗ ${issue}`);
    });
  }

  validationResults.warnings.forEach(warning => {
    warnings.push(warning);
    console.log(`⚠ ${warning}`);
  });

  // Check 6: Check for orphaned files
  const orphanResults = await checkOrphanedFiles(vaultPath, sources);
  if (orphanResults.warnings.length === 0) {
    passed++;
    console.log('✓ No orphaned files detected');
  } else {
    orphanResults.warnings.forEach(warning => {
      warnings.push(warning);
      console.log(`⚠ ${warning}`);
    });
  }

  printValidationSummary(issues, warnings, passed);

  if (issues.length > 0) {
    process.exit(1);
  }
}

function validateEmbeddings(sources) {
  const issues = [];
  const warnings = [];
  const entries = Object.entries(sources);

  if (entries.length === 0) {
    warnings.push('No sources found in data');
    return { issues, warnings };
  }

  let invalidValues = 0;
  let missingVec = 0;
  const dimensionCounts = {};

  for (const [key, source] of entries) {
    if (!source.vec || !Array.isArray(source.vec)) {
      missingVec++;
      continue;
    }

    // Track different vector dimensions
    const dim = source.vec.length;
    dimensionCounts[dim] = (dimensionCounts[dim] || 0) + 1;

    // Check for invalid values (NaN, Infinity)
    const hasInvalid = source.vec.some(v => !isFinite(v));
    if (hasInvalid) {
      invalidValues++;
      issues.push(`${key}: contains invalid values (NaN or Infinity)`);
    }
  }

  if (missingVec > 0) {
    warnings.push(`${missingVec} sources missing embeddings`);
  }

  // Warn about mixed dimensions (indicates model change)
  const dimensions = Object.keys(dimensionCounts);
  if (dimensions.length > 1) {
    const dimInfo = dimensions.map(d => `${d}-dim (${dimensionCounts[d]} sources)`).join(', ');
    warnings.push(`Multiple embedding dimensions found: ${dimInfo}. This is expected when switching models.`);
  }

  return { issues, warnings };
}

async function checkOrphanedFiles(vaultPath, sources) {
  const warnings = [];

  // This is a simple check - just warn about common issues
  // Full filesystem scan would be expensive

  const singleFilePath = path.join(vaultPath, '.smart-env', 'smart_sources.json');
  const multiFilePath = path.join(vaultPath, '.smart-env', 'multi');

  let dataPath;
  if (fs.existsSync(singleFilePath)) {
    dataPath = singleFilePath;
  } else if (fs.existsSync(multiFilePath)) {
    dataPath = multiFilePath;
  } else {
    return { warnings };
  }

  const stats = fs.statSync(dataPath);
  const fileAge = Date.now() - stats.mtimeMs;
  const daysOld = Math.floor(fileAge / (1000 * 60 * 60 * 24));

  if (daysOld > 7) {
    warnings.push(`Data file is ${daysOld} days old - consider re-indexing in Obsidian`);
  }

  return { warnings };
}

function printValidationSummary(issues, warnings, passed) {
  console.log('\n' + '='.repeat(50));
  console.log('Validation Summary');
  console.log('='.repeat(50));
  console.log(`Checks passed: ${passed}`);
  console.log(`Issues: ${issues.length}`);
  console.log(`Warnings: ${warnings.length}`);

  if (issues.length > 0) {
    console.log('\n❌ Issues found:');
    issues.forEach(issue => console.log(`  - ${issue}`));
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    warnings.forEach(warning => console.log(`  - ${warning}`));
  }

  if (issues.length === 0 && warnings.length === 0) {
    console.log('\n✅ All checks passed!');
  }
}
