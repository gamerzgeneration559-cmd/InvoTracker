
/* InvoTracker Suite dashboard-only additions. Existing app.js remains unchanged. */
(() => {
    const $ = id => document.getElementById(id);
    const money = n => '\u20B9' + Number(n).toLocaleString('en-IN', {        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    async function refreshDashboardInventory() {
        if ($('app')?.hidden || !$('dashTotalProducts')) return;

        try {
            const response = await fetch('/api/products', {
                credentials: 'same-origin'
            });

            if (!response.ok) {
                throw new Error('Inventory unavailable (' + response.status + ')');
            }

            const products = await response.json();

            if (!Array.isArray(products)) {
                throw new Error('Unexpected inventory response');
            }

            const low = products.filter(
                p => Number(p.stock) <= Number(p.lowStockLevel)
            ).length;

            const value = products.reduce(
                (sum, p) => sum + Number(p.price || 0) * Number(p.stock || 0),
                0
            );

            $('dashTotalProducts').textContent = String(products.length);
            $('dashLowStock').textContent = String(low);
            $('dashStockValue').textContent = money(value);

            $('dashStockFill').style.width = (
                products.length
                    ? (products.length - low) / products.length * 100
                    : 0
            ) + '%';

            $('dashStockMessage').textContent = products.length
                ? `${products.length - low} products at healthy stock levels; ${low} need attention.`
                : 'No products added yet.';

        } catch (err) {
            $('dashStockMessage').textContent =
                err.message || 'Inventory could not be loaded.';
        }
    }

    document.querySelectorAll('[data-go-page]').forEach(link => {
        link.addEventListener('click', event => {
            event.preventDefault();

            const page = link.getAttribute('data-go-page');

            const sidebarLink = document.querySelector(
                '.sidebarLink[data-page="' + page + '"]'
            );

            sidebarLink?.click();
        });
    });

    document.querySelector(
        '.sidebarLink[data-page="dashboard"]'
    )?.addEventListener('click', refreshDashboardInventory);

    const app = $('app');

    if (app) {
        new MutationObserver(() => {
            if (!app.hidden) refreshDashboardInventory();
        }).observe(app, {
            attributes: true,
            attributeFilter: ['hidden']
        });
    }

    if (app && !app.hidden) {
        refreshDashboardInventory();
    }
})();
