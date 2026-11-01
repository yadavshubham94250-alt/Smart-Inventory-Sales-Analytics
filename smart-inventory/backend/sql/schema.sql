-- Smart Inventory & Sales Analytics System - MySQL 8 schema
-- Conventions:
--   * Money: DECIMAL(12,2). Quantities: INT (UNSIGNED where it can never be negative).
--   * All DATETIME values are stored in IST (UTC+05:30). The backend sets the
--     session time zone to +05:30 on every connection, so NOW() returns IST.
--   * Products are never hard-deleted once referenced; they are archived (is_active = 0).

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  role          ENUM('admin') NOT NULL DEFAULT 'admin',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categories (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(80) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_categories_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sku                 VARCHAR(40)  NOT NULL,
  name                VARCHAR(150) NOT NULL,
  category_id         INT UNSIGNED NOT NULL,
  description         VARCHAR(500) NULL,
  cost_price          DECIMAL(12,2) NOT NULL,
  selling_price       DECIMAL(12,2) NOT NULL,
  stock_qty           INT UNSIGNED NOT NULL DEFAULT 0,
  low_stock_threshold INT UNSIGNED NOT NULL DEFAULT 10,
  is_active           TINYINT(1) NOT NULL DEFAULT 1,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_products_sku (sku),
  KEY idx_products_category (category_id),
  KEY idx_products_active_name (is_active, name),
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT chk_products_cost  CHECK (cost_price >= 0),
  CONSTRAINT chk_products_price CHECK (selling_price >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sales (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_no       VARCHAR(30) NOT NULL,
  customer_name    VARCHAR(100) NULL,
  total_amount     DECIMAL(12,2) NOT NULL,
  status           ENUM('COMPLETED','CANCELLED') NOT NULL DEFAULT 'COMPLETED',
  idempotency_key  VARCHAR(64) NULL,
  created_by       INT UNSIGNED NOT NULL,
  sold_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at     DATETIME NULL,
  cancelled_by     INT UNSIGNED NULL,
  cancel_reason    VARCHAR(255) NULL,
  UNIQUE KEY uq_sales_invoice (invoice_no),
  UNIQUE KEY uq_sales_idem (idempotency_key),
  KEY idx_sales_sold_at (sold_at),
  KEY idx_sales_status_sold_at (status, sold_at),
  CONSTRAINT fk_sales_user      FOREIGN KEY (created_by)   REFERENCES users(id),
  CONSTRAINT fk_sales_cancelled FOREIGN KEY (cancelled_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- product_name/sku are copied so history survives renames; unit_cost is captured
-- at sale time so gross profit stays correct when cost_price changes later.
CREATE TABLE IF NOT EXISTS sale_items (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sale_id      INT UNSIGNED NOT NULL,
  product_id   INT UNSIGNED NOT NULL,
  product_name VARCHAR(150) NOT NULL,
  sku          VARCHAR(40)  NOT NULL,
  quantity     INT UNSIGNED NOT NULL,
  unit_price   DECIMAL(12,2) NOT NULL,
  unit_cost    DECIMAL(12,2) NOT NULL,
  line_total   DECIMAL(12,2) NOT NULL,
  KEY idx_items_sale (sale_id),
  KEY idx_items_product (product_id),
  CONSTRAINT fk_items_sale    FOREIGN KEY (sale_id)    REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT chk_items_qty CHECK (quantity > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS inventory_movements (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id      INT UNSIGNED NOT NULL,
  movement_type   ENUM('INITIAL','RESTOCK','ADJUSTMENT','SALE','SALE_REVERSAL') NOT NULL,
  quantity_before INT NOT NULL,
  quantity_change INT NOT NULL,
  quantity_after  INT NOT NULL,
  reason          VARCHAR(255) NOT NULL,
  sale_id         INT UNSIGNED NULL,
  created_by      INT UNSIGNED NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_mov_product_date (product_id, created_at),
  KEY idx_mov_created (created_at),
  CONSTRAINT fk_mov_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_mov_sale    FOREIGN KEY (sale_id)    REFERENCES sales(id),
  CONSTRAINT fk_mov_user    FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;
