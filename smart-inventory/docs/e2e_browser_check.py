from playwright.sync_api import sync_playwright
import json, re
BASE='http://127.0.0.1:5173'
errors=[]; results=[]
def check(name, cond, extra=''):
    results.append((name, bool(cond))); print(('PASS' if cond else 'FAIL'), name, extra)

with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':1366,'height':850})
    page=ctx.new_page()
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type in ('error','warning') else None)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))

    # unauthenticated -> redirected to login
    page.goto(BASE+'/'); page.wait_for_url('**/login')
    check('unauthenticated dashboard redirects to /login', '/login' in page.url)
    page.screenshot(path='/tmp/shots/01_login.png')

    # client-side validation
    page.click('button:has-text("Log in")')
    check('empty login shows validation messages', page.locator('text=Enter a valid email address.').count()==1)
    # wrong password -> server error shown
    page.fill('#email','admin@example.com'); page.fill('#password','WrongPass1'); page.click('button:has-text("Log in")')
    page.wait_for_selector('.alert-danger')
    check('wrong password shows server error', 'Incorrect email or password' in page.inner_text('.alert-danger'))
    # correct login
    page.fill('#password','Admin1234'); page.click('button:has-text("Log in")')
    page.wait_for_selector('text=Dashboard'); page.wait_for_selector('.kpi-value')
    page.wait_for_timeout(1200)
    check('login lands on dashboard with KPI cards', page.locator('.kpi').count()==8)
    check('token stored in sessionStorage, not localStorage', page.evaluate("!!sessionStorage.getItem('sias_token') && !localStorage.getItem('sias_token')"))
    kpi_text=page.inner_text('.content')
    check('revenue shown in INR format (₹ with Indian grouping)', re.search(r'₹\d{1,3}(,\d{2})*,\d{3}\.\d{2}|₹\d{1,3},\d{3}\.\d{2}', kpi_text) is not None)
    check('dashboard charts rendered (canvas)', page.locator('canvas').count()>=3)
    page.screenshot(path='/tmp/shots/02_dashboard.png', full_page=True)

    # products: search + create + duplicate SKU + validation
    page.click('a.nav-link-x:has-text("Products")'); page.wait_for_selector('table tbody tr')
    page.fill('#f-search','tea'); page.wait_for_timeout(900)
    check('product search filters list', page.locator('tbody tr').count()==1 and 'Tata Tea' in page.inner_text('tbody'))
    page.fill('#f-search',''); page.wait_for_timeout(700)
    page.click('button:has-text("Add product")')
    page.click('button:has-text("Save product")')
    check('empty product form shows field errors', page.locator('.invalid-feedback').count()>=4)
    page.fill('#pf-sku','GRO-001'); page.fill('#pf-name','Duplicate test'); page.select_option('#pf-category_id', index=1)
    page.fill('#pf-cost_price','10'); page.fill('#pf-selling_price','-5'); page.fill('#pf-stock_qty','3')
    page.click('button:has-text("Save product")')
    check('negative price rejected on frontend', 'Enter a price of 0 or more' in page.inner_text('.modal-x'))
    page.fill('#pf-selling_price','15'); page.click('button:has-text("Save product")'); page.wait_for_timeout(800)
    check('duplicate SKU rejected by server (409) with message', 'SKU GRO-001 already exists' in page.inner_text('body') or 'already used' in page.inner_text('.modal-x'))
    page.fill('#pf-sku','E2E-001'); page.fill('#pf-name','E2E Test Item'); page.click('button:has-text("Save product")')
    page.wait_for_selector('.toast-x'); page.wait_for_timeout(600)
    page.fill('#f-search','E2E'); page.wait_for_timeout(900)
    check('new product appears in table', 'E2E Test Item' in page.inner_text('tbody'))
    page.screenshot(path='/tmp/shots/03_products.png')

    # sales: make a sale via UI
    page.click('a.nav-link-x:has-text("Sales")'); page.wait_for_selector('.picker-item')
    page.fill('#ns-search','E2E'); page.wait_for_timeout(800)
    page.click('.picker-item:not([disabled])')
    page.fill('input[aria-label="Quantity for E2E Test Item"]','5')
    check('line total computed (5 x 15 = ₹75.00)', '₹75.00' in page.inner_text('.cart-row'))
    page.fill('input[aria-label="Quantity for E2E Test Item"]','9')
    check('quantity above stock blocked with message', 'Only 3 in stock' in page.inner_text('.cart-row') and page.locator('button:has-text("Review and confirm sale")').is_disabled())
    page.fill('input[aria-label="Quantity for E2E Test Item"]','2')
    page.click('button:has-text("Review and confirm sale")'); page.screenshot(path='/tmp/shots/04_confirm_sale.png')
    page.click('.modal-x button:has-text("Confirm")'); page.wait_for_selector('.toast-x:has-text("recorded")')
    check('sale confirmed with success toast', True)
    # stock should now be 1
    page.click('a.nav-link-x:has-text("Products")'); page.fill('#f-search','E2E'); page.wait_for_timeout(1000)
    row=page.inner_text('tbody tr')
    check('stock reduced 3 -> 1 and status low stock', re.search(r'\b1\b', row) is not None and 'Low stock' in row, row.replace('\n',' | '))

    # sale history -> details -> cancel
    page.click('a.nav-link-x:has-text("Sales")'); page.click('button[role=tab]:has-text("Sales history")'); page.wait_for_selector('tbody tr')
    page.fill('#h-search','E2E'); 
    page.fill('#h-search','Walk'); page.wait_for_timeout(100)
    page.fill('#h-search',''); page.wait_for_timeout(900)
    page.locator('tbody tr').first.locator('button:has-text("Details")').click()
    page.wait_for_selector('.modal-x:has-text("Gross profit")'); page.screenshot(path='/tmp/shots/05_sale_details.png')
    check('details modal shows E2E item', 'E2E Test Item' in page.inner_text('.modal-x'))
    page.click('button:has-text("Cancel this sale")'); page.fill('#cx-reason','E2E cancel test'); page.click('button:has-text("Cancel sale")')
    page.wait_for_selector('.toast-x:has-text("cancelled")'); page.wait_for_timeout(500)
    check('cancel shows CANCELLED status in modal', 'Cancelled' in page.inner_text('.modal-x'))
    page.keyboard.press('Escape')

    # inventory movement history
    page.click('a.nav-link-x:has-text("Inventory")'); page.click('button[role=tab]:has-text("Movement history")'); page.wait_for_selector('tbody tr')
    page.select_option('#m-type','SALE_REVERSAL'); page.wait_for_timeout(900)
    check('movement history filter shows reversal', 'Sale reversal' in page.inner_text('tbody') and 'E2E cancel test' in page.inner_text('tbody'))
    page.screenshot(path='/tmp/shots/06_inventory.png')

    # analytics + reports
    page.click('a.nav-link-x:has-text("Analytics")'); page.wait_for_selector('text=Compare two periods'); page.wait_for_timeout(1800)
    check('analytics page shows compare table with a change %', page.locator('text=Period A').count()>0 and '%' in page.inner_text('.content'))
    page.screenshot(path='/tmp/shots/07_analytics.png', full_page=True)
    page.click('a.nav-link-x:has-text("Reports")'); page.wait_for_selector('text=Sales report')
    with page.expect_download() as dl: page.locator('.panel:has-text("Low-stock report") button:has-text("Download CSV")').click()
    d=dl.value; path='/tmp/shots/'+d.suggested_filename; d.save_as(path)
    txt=open(path,encoding='utf-8-sig').read()
    check('CSV downloaded via UI with header', txt.startswith('SKU,Product,Category,Status'), d.suggested_filename)
    page.screenshot(path='/tmp/shots/08_reports.png')

    # logout
    page.click('button:has-text("Log out")'); page.wait_for_url('**/login')
    check('logout returns to login and clears token', page.evaluate("!sessionStorage.getItem('sias_token')"))
    page.goto(BASE+'/products'); page.wait_for_url('**/login')
    check('protected route inaccessible after logout', '/login' in page.url)

    # mobile layout
    m=b.new_context(viewport={'width':390,'height':800}).new_page()
    m.on('pageerror', lambda e: errors.append(f'mobile pageerror: {e}'))
    m.goto(BASE+'/login'); m.fill('#email','admin@example.com'); m.fill('#password','Admin1234'); m.click('button:has-text("Log in")')
    m.wait_for_selector('.kpi-value'); m.wait_for_timeout(1200)
    check('mobile: sidebar hidden, top bar visible', m.locator('.topbar').is_visible() and not m.locator('.sidebar.open').count())
    overflow=m.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
    check('mobile: no horizontal page overflow on dashboard', not overflow)
    m.screenshot(path='/tmp/shots/09_mobile_dashboard.png')
    m.click('button[aria-label="Open menu"]'); m.wait_for_timeout(400)
    check('mobile: menu opens', m.locator('.sidebar.open').count()==1)
    m.screenshot(path='/tmp/shots/10_mobile_menu.png')
    m.click('.sidebar a:has-text("Products")'); m.wait_for_selector('tbody tr'); m.wait_for_timeout(300)
    check('mobile: menu closes after navigation', m.locator('.sidebar.open').count()==0)
    check('mobile: products page no horizontal page overflow', not m.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1"))
    b.close()

print('\nBROWSER CONSOLE/PAGE ERRORS:', errors if errors else 'none')
print(f"\n{sum(1 for _,ok in results if ok)}/{len(results)} checks passed")
