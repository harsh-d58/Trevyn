"""ShopFlow demo shop with planted, toggleable bugs (BACKEND_AND_REMAINING_WORK.md Part 14).

BUGS env: "all" (default) or a comma list of: dup_order, email_validation, user_enum, profile_persist,
negative_qty, oos_500, no_sec_headers, slow_orders. Removing a flag "fixes" that defect.
Run: uv run uvicorn demo_shop.app:app --port 3100
"""
import os
import re
import sqlite3
import time
from pathlib import Path

from fastapi import Depends, FastAPI, Form, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from jinja2 import DictLoader, Environment

from .templates import ART, CSS, META, TEMPLATES

ALL = {"dup_order", "email_validation", "user_enum", "profile_persist", "negative_qty", "oos_500", "no_sec_headers", "slow_orders"}
_raw = os.getenv("BUGS", "all")
BUGS = set(ALL) if _raw == "all" else {b.strip() for b in _raw.split(",") if b.strip()}
HOOK_TOKEN = os.getenv("TREVYN_HOOK_TOKEN", "")
DB = Path(os.getenv("DEMO_SHOP_DB", "var/demo-shop.db"))

SEED_USERS = [("qa@shop.test", "Passw0rd!", "QA Shopper")]
SEED_PRODUCTS = [(1, "Everyday Backpack", 79.0, 12), (2, "Trail Bottle", 18.0, 40), (3, "Summit Jacket", 149.0, 0),
                 (4, "Ridge Runner Shoes", 119.0, 22), (5, "Merino Beanie", 24.0, 8), (6, "Basecamp 2P Tent", 239.0, 5)]


def db() -> sqlite3.Connection:
    con = sqlite3.connect(DB, check_same_thread=False)
    con.row_factory = sqlite3.Row
    return con


def reset() -> None:
    DB.parent.mkdir(parents=True, exist_ok=True)
    with db() as c:
        c.executescript("""
        DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS products; DROP TABLE IF EXISTS cart; DROP TABLE IF EXISTS orders;
        CREATE TABLE users(id INTEGER PRIMARY KEY, email TEXT UNIQUE, password TEXT, name TEXT);
        CREATE TABLE products(id INTEGER PRIMARY KEY, name TEXT, price REAL, stock INTEGER);
        CREATE TABLE cart(user_id INTEGER, product_id INTEGER, qty INTEGER, PRIMARY KEY(user_id, product_id));
        CREATE TABLE orders(id INTEGER PRIMARY KEY, user_id INTEGER, total REAL, idem_key TEXT, created REAL);
        """)
        c.executemany("INSERT INTO users(email,password,name) VALUES(?,?,?)", SEED_USERS)
        c.executemany("INSERT INTO products VALUES(?,?,?,?)", SEED_PRODUCTS)
        c.execute("INSERT INTO cart VALUES(1,1,1)")
        c.execute("INSERT INTO orders(id,user_id,total,idem_key,created) VALUES(1000,1,36.0,NULL,?)", (time.time() - 86400,))


reset()
app = FastAPI(title="ShopFlow demo shop", docs_url=None, redoc_url=None)

T = Environment(loader=DictLoader(TEMPLATES), autoescape=True)
T.globals.update(META=META, ART=ART, CSS=CSS)


def page(name: str, request: Request, **ctx) -> HTMLResponse:
    u = current(request)
    count = db().execute("SELECT COALESCE(SUM(qty),0) n FROM cart WHERE user_id=?", (u["id"],)).fetchone()["n"] if u else 0
    return HTMLResponse(T.get_template(name).render(user=u, cart_count=count, **ctx))


def current(request: Request):
    sid = request.cookies.get("sid")
    if not sid or not sid.isdigit():
        return None
    return db().execute("SELECT * FROM users WHERE id=?", (int(sid),)).fetchone()


def need_user(request: Request):
    u = current(request)
    if not u:
        raise HTTPException(401, "Log in first")
    return u


def cart_total(uid: int) -> tuple[list, float]:
    lines = db().execute("SELECT c.product_id,c.product_id AS id,c.qty,p.name,p.price FROM cart c JOIN products p ON p.id=c.product_id WHERE c.user_id=?", (uid,)).fetchall()
    return lines, sum(row["qty"] * row["price"] for row in lines)


@app.middleware("http")
async def headers(request: Request, call_next):
    resp = await call_next(request)
    if "no_sec_headers" not in BUGS:
        resp.headers["Content-Security-Policy"] = "default-src 'self' 'unsafe-inline'"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["X-Content-Type-Options"] = "nosniff"
    return resp


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return page("home", request, title="Shop", products=db().execute("SELECT * FROM products").fetchall())


@app.get("/login", response_class=HTMLResponse)
def login_form(request: Request):
    return page("login", request, title="Log in")


@app.post("/login")
def login(request: Request, email: str = Form(""), password: str = Form("")):
    u = db().execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    if not u or u["password"] != password:
        msg = ("User not found" if not u else "Wrong password") if "user_enum" in BUGS else "Email or password is incorrect"
        return page("login", request, title="Log in", error=msg)
    r = RedirectResponse("/", 303)
    r.set_cookie("sid", str(u["id"]), httponly=True, samesite="lax")
    return r


@app.get("/register", response_class=HTMLResponse)
def register_form(request: Request):
    return page("register", request, title="Register")


@app.post("/register")
def register(request: Request, name: str = Form(""), email: str = Form(""), password: str = Form("")):
    pattern = r"^[^@\s]+@[^@\s]+$" if "email_validation" in BUGS else r"^[^@\s]+@[^@\s]+\.[a-z]{2,}$"
    if not re.match(pattern, email, re.I):
        return page("register", request, title="Register", msg="Enter a valid email address", cls="err")
    try:
        with db() as c:
            c.execute("INSERT INTO users(email,password,name) VALUES(?,?,?)", (email, password, name or "Shopper"))
    except sqlite3.IntegrityError:
        return page("register", request, title="Register", msg="That email is already registered", cls="err")
    return page("register", request, title="Register", msg="Account created", cls="ok")


@app.get("/product/{pid}", response_class=HTMLResponse)
def product(pid: int, request: Request):
    p = db().execute("SELECT * FROM products WHERE id=?", (pid,)).fetchone()
    if not p:
        raise HTTPException(404)
    return page("product", request, title=p["name"], p=p, bug_oos="oos_500" in BUGS)


@app.get("/api/stock/{pid}")
def stock(pid: int):
    p = db().execute("SELECT stock FROM products WHERE id=?", (pid,)).fetchone()
    if p and p["stock"] == 0 and "oos_500" in BUGS:
        raise HTTPException(500, "stock service error")
    return {"stock": p["stock"] if p else 0}


@app.post("/api/cart")
async def add_cart(request: Request, u=Depends(need_user)):
    pid = int((await request.json())["product_id"])
    with db() as c:
        c.execute("INSERT INTO cart VALUES(?,?,1) ON CONFLICT(user_id,product_id) DO UPDATE SET qty=qty+1", (u["id"], pid))
    return {"ok": True}


@app.post("/api/cart/qty")
async def set_qty(request: Request, u=Depends(need_user)):
    body = await request.json()
    qty = int(body["qty"])
    if qty < 1 and "negative_qty" not in BUGS:
        raise HTTPException(422, "Quantity must be at least 1")
    with db() as c:
        c.execute("UPDATE cart SET qty=? WHERE user_id=? AND product_id=?", (qty, u["id"], int(body["product_id"])))
    return {"ok": True}


@app.get("/cart", response_class=HTMLResponse)
def cart(request: Request, u=Depends(need_user)):
    lines, total = cart_total(u["id"])
    return page("cart", request, title="Cart", lines=lines, total=total)


@app.get("/checkout", response_class=HTMLResponse)
def checkout(request: Request, u=Depends(need_user)):
    lines, total = cart_total(u["id"])
    return page("checkout", request, title="Checkout", lines=lines, total=total, bug_dup="dup_order" in BUGS)


@app.post("/api/orders")
def place_order(u=Depends(need_user), idempotency_key: str | None = Header(None)):
    with db() as c:
        if idempotency_key and "dup_order" not in BUGS:
            prev = c.execute("SELECT id FROM orders WHERE user_id=? AND idem_key=?", (u["id"], idempotency_key)).fetchone()
            if prev:
                return {"id": prev["id"], "duplicate": True}
        cur = c.execute("INSERT INTO orders(user_id,total,idem_key,created) VALUES(?,?,?,?)",
                        (u["id"], cart_total(u["id"])[1], idempotency_key, time.time()))
    return JSONResponse({"id": cur.lastrowid}, status_code=201)


@app.get("/orders", response_class=HTMLResponse)
def orders(request: Request, u=Depends(need_user)):
    rows = db().execute("SELECT * FROM orders WHERE user_id=? ORDER BY id", (u["id"],)).fetchall()
    if "slow_orders" in BUGS:
        for r in rows:  # N+1: one extra query per order
            db().execute("SELECT * FROM cart WHERE user_id=?", (r["user_id"],)).fetchall()
            time.sleep(0.15)
    orders = [{**dict(r), "when": time.strftime("%d %b %Y, %H:%M", time.localtime(r["created"]))} for r in rows]
    return page("orders", request, title="Orders", orders=orders)


@app.get("/profile", response_class=HTMLResponse)
def profile(request: Request, u=Depends(need_user)):
    return page("profile", request, title="Profile")


@app.post("/api/profile")
async def save_profile(request: Request, u=Depends(need_user)):
    name = (await request.json()).get("name", "")
    if "profile_persist" not in BUGS:
        with db() as c:
            c.execute("UPDATE users SET name=? WHERE id=?", (name, u["id"]))
    return {"ok": True}


@app.get("/search", response_class=HTMLResponse)
def search(request: Request, q: str = ""):
    found = db().execute("SELECT * FROM products WHERE name LIKE ?", (f"%{q}%",)).fetchall()
    return page("search", request, title="Search", q=q, results=found)


# ---- test hooks (Part 14.1): demo-only, token-protected when TREVYN_HOOK_TOKEN is set ----
def hook_auth(x_trevyn_token: str | None = Header(None)):
    if HOOK_TOKEN and x_trevyn_token != HOOK_TOKEN:
        raise HTTPException(403, "bad hook token")


@app.get("/__trevyn/health")
def health():
    return {"ok": True, "bugs": sorted(BUGS)}


@app.post("/__trevyn/reset", dependencies=[Depends(hook_auth)])
def hook_reset():
    reset()
    return {"ok": True}


@app.get("/__trevyn/orders", dependencies=[Depends(hook_auth)])
def hook_orders(email: str = "qa@shop.test"):
    row = db().execute("SELECT COUNT(*) n FROM orders o JOIN users u ON u.id=o.user_id WHERE u.email=?", (email,)).fetchone()
    return {"count": row["n"]}


@app.post("/__trevyn/bugs", dependencies=[Depends(hook_auth)])
async def hook_bugs(request: Request):
    """Demo-only: set the active bug flags at runtime. `{"bugs": "all"}` restores every planted bug."""
    raw = (await request.json()).get("bugs", [])
    BUGS.clear()
    BUGS.update(ALL if raw == "all" else set(raw) & ALL)
    return {"ok": True, "bugs": sorted(BUGS)}
