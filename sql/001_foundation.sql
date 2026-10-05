-- Estructura aditiva. Las tablas y endpoints anteriores siguen funcionando.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(80) PRIMARY KEY,
  applied_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS catalog_products (
  id CHAR(36) PRIMARY KEY,
  legacy_product_id INT UNIQUE,
  name VARCHAR(255) NOT NULL,
  brand VARCHAR(255),
  category VARCHAR(255),
  product_type VARCHAR(255),
  product_subtype VARCHAR(255),
  package_content DECIMAL(18,6),
  content_unit ENUM('g','ml','unit'),
  legacy_presentation DECIMAL(18,6),
  unit_status ENUM('unconfirmed','confirmed') NOT NULL DEFAULT 'unconfirmed',
  revision INT NOT NULL DEFAULT 1,
  deleted_at DATETIME(6),
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CHECK (package_content IS NULL OR package_content > 0),
  CHECK (unit_status <> 'confirmed' OR (package_content IS NOT NULL AND content_unit IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS store_branches (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address VARCHAR(500),
  legacy_market VARCHAR(255),
  location_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  revision INT NOT NULL DEFAULT 1,
  deleted_at DATETIME(6)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchases (
  id CHAR(36) PRIMARY KEY,
  branch_id CHAR(36),
  occurred_at DATETIME(6),
  occurred_on DATE NOT NULL,
  event_timezone VARCHAR(80),
  time_precision ENUM('date','instant') NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'ARS',
  legacy_instance_id INT UNIQUE,
  historical BOOLEAN NOT NULL DEFAULT FALSE,
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  received_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (branch_id) REFERENCES store_branches(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_lines (
  id CHAR(36) PRIMARY KEY,
  purchase_id CHAR(36) NOT NULL,
  product_id CHAR(36) NOT NULL,
  quantity DECIMAL(18,6) NOT NULL,
  quantity_basis ENUM('package','g','ml','unit','legacy_unconfirmed') NOT NULL,
  total_paid DECIMAL(18,4) NOT NULL,
  is_promotion BOOLEAN NOT NULL,
  legacy_unit_price DECIMAL(18,4),
  FOREIGN KEY (purchase_id) REFERENCES purchases(id),
  FOREIGN KEY (product_id) REFERENCES catalog_products(id),
  INDEX (product_id, purchase_id),
  CHECK (quantity > 0),
  CHECK (total_paid >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS price_observations (
  id CHAR(36) PRIMARY KEY,
  product_id CHAR(36) NOT NULL,
  branch_id CHAR(36),
  occurred_at DATETIME(6) NOT NULL,
  event_timezone VARCHAR(80) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'ARS',
  quantity DECIMAL(18,6) NOT NULL,
  quantity_basis ENUM('package','g','ml','unit') NOT NULL,
  total_price DECIMAL(18,4) NOT NULL,
  promotion_description VARCHAR(500),
  received_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (product_id) REFERENCES catalog_products(id),
  FOREIGN KEY (branch_id) REFERENCES store_branches(id),
  INDEX (product_id, occurred_at),
  CHECK (quantity > 0),
  CHECK (total_price >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sync_receipts (
  operation_id CHAR(36) PRIMARY KEY,
  payload_hash CHAR(64) NOT NULL,
  entity_id CHAR(36) NOT NULL,
  result_json JSON NOT NULL,
  received_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;
