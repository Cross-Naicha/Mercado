CREATE TABLE IF NOT EXISTS stock_lots (
 id CHAR(36) PRIMARY KEY,
 product_id CHAR(36) NOT NULL,
 purchase_id CHAR(36) UNIQUE,
 unit ENUM('g','ml','unit') NOT NULL,
 location VARCHAR(255) NOT NULL,
 expires_on DATE,
 expiry_source ENUM('exact','estimated') NOT NULL DEFAULT 'exact',
 created_at DATETIME(6) NOT NULL,
 FOREIGN KEY(product_id) REFERENCES catalog_products(id),
 FOREIGN KEY(purchase_id) REFERENCES purchases(id),
 INDEX(product_id,expires_on)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS stock_movements (
 id CHAR(36) PRIMARY KEY,
 lot_id CHAR(36) NOT NULL,
 quantity DECIMAL(18,6) NOT NULL,
 reason ENUM('initial','purchase','consume','discard','adjust','open','reversal') NOT NULL,
 reverses_id CHAR(36) UNIQUE,
 occurred_at DATETIME(6) NOT NULL,
 event_timezone VARCHAR(80) NOT NULL,
 note VARCHAR(500),
 received_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(lot_id) REFERENCES stock_lots(id),
 FOREIGN KEY(reverses_id) REFERENCES stock_movements(id),
 CHECK(quantity <> 0 OR reason='open'),
 INDEX(lot_id,occurred_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS stock_preferences (
 product_id CHAR(36) PRIMARY KEY,
 minimum_quantity DECIMAL(18,6) NOT NULL DEFAULT 0,
 revision INT NOT NULL DEFAULT 1,
 FOREIGN KEY(product_id) REFERENCES catalog_products(id),
 CHECK(minimum_quantity>=0)
) ENGINE=InnoDB;
