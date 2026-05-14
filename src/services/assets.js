function createAssetService({ contractAccounts, levelFields, waxService }) {
  async function getAssets(wallet) {
    let allAssets = [];
    let page = 1;
    const limit = 1000;

    while (true) {
      const url =
        `https://wax.api.atomicassets.io/atomicassets/v1/assets` +
        `?owner=${wallet}` +
        `&limit=${limit}` +
        `&page=${page}`;

      const response = await fetch(url);
      const json = await response.json();
      const assets = json.data || [];
      allAssets = allAssets.concat(assets);

      if (assets.length < limit) break;
      page++;
    }

    return allAssets;
  }

  function makePseudoAsset({ templateId, tier = 0, assetId = null, source = "staked" }) {
    return {
      asset_id: assetId ? String(assetId) : `${source}-${templateId}-${Math.random()}`,
      template: { template_id: String(templateId) },
      mutable_data: { tier },
      data: { tier },
      source
    };
  }

  async function getStakedAssets(wallet) {
    const stakedAssets = [];

    for (const contract of contractAccounts) {
      const factories = await waxService.getRowsByOwner(contract, "factories", wallet);
      for (const row of factories) {
        stakedAssets.push(makePseudoAsset({
          templateId: row.template_id || "708905",
          tier: row.tier || 0,
          assetId: row.asset_id,
          source: `${contract}:factories`
        }));
      }

      const machines = await waxService.getRowsByOwner(contract, "machines", wallet);
      for (const row of machines) {
        stakedAssets.push(makePseudoAsset({
          templateId: row.template_id,
          tier: row.tier || 0,
          assetId: row.asset_id,
          source: `${contract}:machines`
        }));
      }

      const labourers = await waxService.getRowsByOwner(contract, "labourers", wallet);
      for (const row of labourers) {
        stakedAssets.push(makePseudoAsset({
          templateId: row.template_id || "708902",
          tier: row.tier || 0,
          assetId: row.asset_id,
          source: `${contract}:labourers`
        }));
      }

      const techCenters = await waxService.getRowsByOwner(contract, "techcenter", wallet);
      for (const row of techCenters) {
        stakedAssets.push(makePseudoAsset({
          templateId: "768499",
          tier: row.tier || 0,
          assetId: row.asset_id,
          source: `${contract}:techcenter`
        }));
      }

      const chronicles = await waxService.getRowsByOwner(contract, "chronicles", wallet);
      for (const row of chronicles) {
        stakedAssets.push(makePseudoAsset({
          templateId: row.chronicle_template_id,
          tier: 0,
          assetId: row.asset_id,
          source: `${contract}:chronicles`
        }));
      }

      const userMilitary = await waxService.getRowsByPrimaryAccount(contract, "usermilitary", wallet);
      for (const row of userMilitary) {
        const data = row.data_tier_quantity || [];

        for (const militaryTier of data) {
          const tier = militaryTier.tier || 0;
          const quantity = militaryTier.quantity || 0;

          for (let i = 0; i < quantity; i++) {
            stakedAssets.push(makePseudoAsset({
              templateId: "711919",
              tier,
              assetId: `${contract}-military-${wallet}-${tier}-${i}`,
              source: `${contract}:usermilitary`
            }));
          }
        }
      }
    }

    return dedupeAssets(stakedAssets);
  }

  function dedupeAssets(assets) {
    const seen = new Set();
    const unique = [];

    for (const asset of assets) {
      const key = String(asset.asset_id || "");
      if (!key) {
        unique.push(asset);
        continue;
      }

      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(asset);
    }

    return unique;
  }

  async function getAllRoleAssets(wallet) {
    const walletAssets = await getAssets(wallet);
    const stakedAssets = await getStakedAssets(wallet);
    return {
      walletAssets,
      stakedAssets,
      combinedAssets: dedupeAssets([...walletAssets, ...stakedAssets])
    };
  }

  function getTemplateId(asset) {
    return String(asset.template?.template_id || asset.template_id || "");
  }

  function getAssetLevel(asset) {
    const sources = [asset.mutable_data, asset.immutable_data, asset.data, asset.template?.immutable_data, asset];

    for (const source of sources) {
      if (!source) continue;

      for (const field of levelFields) {
        if (source[field] !== undefined && source[field] !== null) {
          const lvl = parseInt(source[field], 10);
          if (!Number.isNaN(lvl)) return lvl;
        }
      }
    }

    return 0;
  }

  function countTemplates(assets) {
    const counts = {};
    for (const asset of assets) {
      const templateId = getTemplateId(asset);
      if (!templateId) continue;
      counts[templateId] = (counts[templateId] || 0) + 1;
    }
    return counts;
  }

  function countAssetsByTemplateMinLevel(assets, templateId, minLevel) {
    return assets.filter(asset =>
      getTemplateId(asset) === String(templateId) &&
      getAssetLevel(asset) >= minLevel
    ).length;
  }

  function hasMachineSetAtLevel(assets, minLevel) {
    const machineTemplateIds = ["708910", "708908", "708907", "708906"];
    return machineTemplateIds.every(templateId =>
      assets.some(asset =>
        getTemplateId(asset) === templateId &&
        getAssetLevel(asset) >= minLevel
      )
    );
  }

  function qualifiesForFounderEmpire(assets, counts) {
    const factoryTier9 = countAssetsByTemplateMinLevel(assets, "708905", 9);
    const skillLaborerTier9 = countAssetsByTemplateMinLevel(assets, "708902", 9);
    const techCenterTier3 = countAssetsByTemplateMinLevel(assets, "768499", 3);
    const militaryTier4 = countAssetsByTemplateMinLevel(assets, "711919", 4);
    const chronicleBooks = counts["776806"] || 0;

    const hasAllMachinesTier9 = hasMachineSetAtLevel(assets, 9);
    const hasNeonGenesisSet = ["452006", "452005", "452004", "452003", "452002"]
      .every(id => (counts[id] || 0) >= 1);

    return (
      factoryTier9 >= 3 &&
      hasAllMachinesTier9 &&
      skillLaborerTier9 >= 4 &&
      techCenterTier3 >= 1 &&
      militaryTier4 >= 3 &&
      chronicleBooks >= 3 &&
      hasNeonGenesisSet
    );
  }

  function qualifiesForRule(rule, assets, counts) {
    if (rule.type === "simple_template") return (counts[rule.templateId] || 0) >= rule.quantity;

    if (rule.type === "tiered_template") {
      return assets.some(asset =>
        getTemplateId(asset) === rule.templateId &&
        getAssetLevel(asset) >= rule.minLevel
      );
    }

    if (rule.type === "tiered_quantity") {
      return countAssetsByTemplateMinLevel(assets, rule.templateId, rule.minLevel) >= rule.quantity;
    }

    if (rule.type === "machine_set") {
      return rule.templateIds.every(id =>
        assets.some(asset =>
          getTemplateId(asset) === id &&
          getAssetLevel(asset) >= rule.minLevel
        )
      );
    }

    if (rule.type === "all_templates") {
      return rule.templateIds.every(id => (counts[id] || 0) >= rule.quantityEach);
    }

    if (rule.type === "founder_empire") return qualifiesForFounderEmpire(assets, counts);

    return false;
  }

  function selectHighestGroupedRules(qualified) {
    const grouped = {};
    const final = [];

    for (const rule of qualified) {
      if (!rule.group) {
        final.push(rule);
        continue;
      }

      const current = grouped[rule.group];
      if (!current || rule.minLevel > current.minLevel) grouped[rule.group] = rule;
    }

    return [...final, ...Object.values(grouped)];
  }

  return {
    getAssets,
    getStakedAssets,
    getAllRoleAssets,
    getTemplateId,
    getAssetLevel,
    countTemplates,
    countAssetsByTemplateMinLevel,
    hasMachineSetAtLevel,
    qualifiesForRule,
    selectHighestGroupedRules
  };
}

module.exports = {
  createAssetService
};
