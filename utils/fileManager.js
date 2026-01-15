const fs = require("fs");
const path = require("path");

const BASE_DIR = path.join(__dirname, "..");
const CONFIG_PATH = path.join(BASE_DIR, "config.json");
const DATA_PATH = path.join(BASE_DIR, "data.json");

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error);
    return fallback;
  }
}

function saveJson(filePath, payload) {
  try {
    // Atomic write - write to temp file first, then rename
    const tempPath = `${filePath}.tmp`;
    const content = JSON.stringify(payload, null, 2);
    fs.writeFileSync(tempPath, content, 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    console.error(`Error saving ${filePath}:`, error);
    // Clean up temp file if it exists
    try {
      const tempPath = `${filePath}.tmp`;
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Add logo thumbnail to an embed if configured
 * @param {EmbedBuilder} embed - The embed to add logo to
 * @param {Object} config - Bot configuration
 * @returns {EmbedBuilder} The embed with logo added
 */
function addLogo(embed, config) {
  if (config.logo_url) {
    embed.setThumbnail(config.logo_url);
  }
  return embed;
}

module.exports = {
  BASE_DIR,
  CONFIG_PATH,
  DATA_PATH,
  loadJson,
  saveJson,
  addLogo,
};
