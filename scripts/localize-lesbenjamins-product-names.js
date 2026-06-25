const fs = require("fs");
const path = require("path");
const { localizedNameFromStoredProduct } = require("./lesbenjamins-name-utils");

const DATA_FILE = path.join(process.cwd(), "data", "site-data.json");
const SOURCE_MARKER = "lesbenjamins";

function replaceVisibleName(value, oldName, newName) {
  if (!value || !oldName || oldName === newName) return value;
  return String(value).replaceAll(oldName, newName);
}

function main() {
  const siteData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const examples = [];
  let changed = 0;

  siteData.products = (siteData.products || []).map((product) => {
    if (product.source !== SOURCE_MARKER) return product;

    const oldName = product.name;
    const newName = localizedNameFromStoredProduct(product);
    if (!newName || oldName === newName) return product;

    changed += 1;
    if (examples.length < 16) examples.push({ oldName, newName });

    return {
      ...product,
      name: newName,
      summary: replaceVisibleName(product.summary, oldName, newName),
      description: replaceVisibleName(product.description, oldName, newName)
    };
  });

  siteData.settings = {
    ...(siteData.settings || {}),
    lastLesBenjaminsNameLocalization: new Date().toISOString()
  };

  fs.writeFileSync(DATA_FILE, `${JSON.stringify(siteData, null, 2)}\n`);
  console.log(JSON.stringify({ changed, examples }, null, 2));
}

main();
