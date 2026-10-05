CREATE TABLE IF NOT EXISTS product_barcodes (
 code VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 product_id CHAR(36) NOT NULL,
 received_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(product_id) REFERENCES catalog_products(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS shopping_documents (
 id CHAR(36) PRIMARY KEY,
 kind ENUM('map','location','group','photo') NOT NULL,
 owner_id CHAR(36) NOT NULL,
 payload JSON NOT NULL,
 revision INT NOT NULL DEFAULT 1,
 received_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 INDEX(kind,owner_id)
) ENGINE=InnoDB;
