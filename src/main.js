function calculateSimpleRevenue(purchase, _product) {
    if (!purchase || typeof purchase !== 'object') return 0;
    const quantity = Number(purchase.quantity) || 0;
    const salePrice = Number(purchase.sale_price) || 0;
    let discountPct = Number(purchase.discount) || 0;
    if (!isFinite(discountPct)) discountPct = 0;
    if (discountPct < 0) discountPct = 0;
    if (discountPct > 100) discountPct = 100;

    return salePrice * quantity * (1 - discountPct / 100);
}

function calculateBonusByProfit(index, total, seller) {
    if (!seller || typeof seller.profit !== 'number' || !isFinite(seller.profit)) return 0;
    if (!total || total <= 0) return 0;

    let percent = 0;
    if (index === 0) percent = 0.15;
    else if (index === 1 || index === 2) percent = 0.10;
    else if (index === total - 1) percent = 0.0;
    else percent = 0.05;

    return +Number(seller.profit * percent).toFixed(2);
}

function analyzeSalesData(data, options) {
    if (!data || typeof data !== 'object') {
        throw new Error('Некорректные входные данные: ожидается объект с коллекциями.');
    }
    const sellers = data.sellers;
    const products = data.products;
    const receipts = data.purchase_records;
    if (!Array.isArray(sellers) || sellers.length === 0) {
        throw new Error('Некорректные данные: коллекция sellers должна быть непустым массивом.');
    }
    if (!Array.isArray(products) || products.length === 0) {
        throw new Error('Некорректные данные: коллекция products должна быть непустым массивом.');
    }
    if (!Array.isArray(receipts) || receipts.length === 0) {
        throw new Error('Некорректные данные: коллекция purchase_records должна быть непустым массивом.');
    }

    if (!options || typeof options !== 'object') {
        throw new Error('Не переданы настройки: ожидаются функции calculateRevenue и calculateBonus.');
    }
    const calculateRevenue = options.calculateRevenue;
    const calculateBonus = options.calculateBonus;
    if (typeof calculateRevenue !== 'function') {
        throw new Error('Некорректные настройки: calculateRevenue должна быть функцией.');
    }
    if (typeof calculateBonus !== 'function') {
        throw new Error('Некорректные настройки: calculateBonus должна быть функцией.');
    }

    const productIndex = {};
    const sellerStats = sellers
        .filter(function(s) { return s && s.id; })
        .map(function(seller) {
            return {
                id: seller.id,
                name: (seller.first_name ? seller.first_name : '') + (seller.last_name ? ' ' + seller.last_name : ''),
                revenue: 0,
                profit: 0,
                sales_count: 0,
                products_sold: {}
            };
        });

    const statsIndex = {};
    for (let si = 0; si < sellerStats.length; si++) {
        const sStat = sellerStats[si];
        statsIndex[sStat.id] = sStat;
    }

    for (let j = 0; j < products.length; j++) {
        const p = products[j];
        if (!p || !p.sku) continue;
        productIndex[p.sku] = p;
    }

    for (let r = 0; r < receipts.length; r++) {
        const receipt = receipts[r];
        if (!receipt || !receipt.seller_id || !statsIndex[receipt.seller_id]) continue;

        const stat = statsIndex[receipt.seller_id];
        stat.sales_count += 1;
        const receiptAmount = isFinite(Number(receipt.total_amount)) ? Number(receipt.total_amount) : 0;
        stat.revenue += receiptAmount;

        const items = Array.isArray(receipt.items) ? receipt.items : [];
        for (let k = 0; k < items.length; k++) {
            const item = items[k];
            if (!item || !item.sku) continue;

            const product = productIndex[item.sku];
            const revenue = calculateRevenue(item, product);

            const quantity = Number(item.quantity) || 0;
            const purchasePrice = product && isFinite(Number(product.purchase_price)) ? Number(product.purchase_price) : 0;
            const cost = purchasePrice * quantity;
            const profitDelta = revenue - cost;
            stat.profit += profitDelta;

            if (!stat.products_sold[item.sku]) stat.products_sold[item.sku] = 0;
            stat.products_sold[item.sku] += quantity;
        }
    }

    for (let siCalc = 0; siCalc < sellerStats.length; siCalc++) {
        const sst = sellerStats[siCalc];
        sst.profit = +Number(sst.profit || 0).toFixed(2);
    }

    sellerStats.sort(function(a, b) { return b.profit - a.profit; });

    const total = sellerStats.length;
    for (let si2 = 0; si2 < sellerStats.length; si2++) {
        const sellerStat = sellerStats[si2];
        sellerStat.bonus = calculateBonus(si2, total, sellerStat);

        const entries = Object.entries(sellerStat.products_sold || {});
        const topProducts = entries
            .map(function(pair) { return { sku: pair[0], quantity: pair[1] }; })
            .sort(function(a, b) { return b.quantity - a.quantity; })
            .slice(0, 10);
        sellerStat.top_products = topProducts;
    }

    return sellerStats.map(function(st) {
        return {
            seller_id: st.id,
            name: st.name || st.seller_id,
            revenue: +Number(st.revenue || 0).toFixed(2),
            profit: +Number(st.profit || 0).toFixed(2),
            sales_count: st.sales_count,
            top_products: st.top_products || [],
            bonus: +Number(st.bonus || 0).toFixed(2)
        };
    });
}
