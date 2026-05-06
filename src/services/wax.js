function createWaxService({ waxChainApi, logTableReadWarning }) {
  async function getTableRows({ code, table, lowerBound = null, upperBound = null, useOwnerIndex = false }) {
    const rows = [];
    let more = true;
    let nextKey = lowerBound;
    const limit = 1000;

    while (more) {
      const body = { json: true, code, scope: code, table, limit };

      if (useOwnerIndex) {
        body.index_position = "2";
        body.key_type = "i64";
      }

      if (nextKey) body.lower_bound = nextKey;
      if (upperBound) body.upper_bound = upperBound;

      try {
        const response = await fetch(`${waxChainApi}/v1/chain/get_table_rows`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });

        const json = await response.json();

        if (!response.ok || json.error) {
          logTableReadWarning(code, table, json.error?.what || json.message || "Unknown table error");
          break;
        }

        rows.push(...(json.rows || []));
        more = Boolean(json.more);
        if (!more) break;

        nextKey = json.next_key || json.next_key === "" ? json.next_key : null;
        if (!nextKey) break;
      } catch (error) {
        logTableReadWarning(code, table, error.message, "Failed to read table");
        break;
      }
    }

    return rows;
  }

  async function getRowsByOwner(code, table, wallet) {
    const rows = await getTableRows({ code, table, lowerBound: wallet, upperBound: wallet, useOwnerIndex: true });
    return rows.filter(row => row.owner === wallet || row.account === wallet);
  }

  async function getRowsByPrimaryAccount(code, table, wallet) {
    const rows = await getTableRows({ code, table, lowerBound: wallet, upperBound: wallet, useOwnerIndex: false });
    return rows.filter(row => row.owner === wallet || row.account === wallet);
  }

  return {
    getTableRows,
    getRowsByOwner,
    getRowsByPrimaryAccount
  };
}

module.exports = {
  createWaxService
};
