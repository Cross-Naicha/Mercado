CREATE TABLE `instances` (
  `id_instance` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL,
  `quantity` float DEFAULT NULL,
  `price` float NOT NULL,
  `is_promotion` tinyint DEFAULT NULL,
  `obs_date` date NOT NULL,
  `market` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id_instance`)
) ENGINE=InnoDB AUTO_INCREMENT=63 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `products` (
  `id_product` int NOT NULL AUTO_INCREMENT,
  `pclass` varchar(255) DEFAULT NULL,
  `product` varchar(255) NOT NULL,
  `brand` varchar(255) DEFAULT NULL,
  `ptype` varchar(255) DEFAULT NULL,
  `psubtype` varchar(255) DEFAULT NULL,
  `presentation` float DEFAULT NULL,
  PRIMARY KEY (`id_product`)
) ENGINE=InnoDB AUTO_INCREMENT=37 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `rv_last_prices` AS select `products`.`id_product` AS `id_last_price`,`products`.`product` AS `product`,`products`.`pclass` AS `pclass`,`products`.`brand` AS `brand`,`products`.`ptype` AS `ptype`,`products`.`psubtype` AS `psubtype`,`products`.`presentation` AS `presentation`,`normal_instances`.`price` AS `normal_price`,(`normal_instances`.`price` / `products`.`presentation`) AS `normal_unit`,`normal_instances`.`obs_date` AS `normal_date`,`promotion_instances`.`price` AS `promotion_price`,(`promotion_instances`.`price` / `products`.`presentation`) AS `promotion_unit`,`promotion_instances`.`obs_date` AS `promotion_date` from ((`products` left join `instances` `normal_instances` on((`normal_instances`.`id_instance` = (select `instances`.`id_instance` from `instances` where ((`instances`.`product_id` = `products`.`id_product`) and (`instances`.`is_promotion` = 0)) order by `instances`.`obs_date` desc limit 1)))) left join `instances` `promotion_instances` on((`promotion_instances`.`id_instance` = (select `instances`.`id_instance` from `instances` where ((`instances`.`product_id` = `products`.`id_product`) and (`instances`.`is_promotion` = 1)) order by `instances`.`obs_date` desc limit 1))));

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `rv_tickets` AS select `instances`.`id_instance` AS `id_instance`,`instances`.`product_id` AS `product_id`,`instances`.`quantity` AS `quantity`,round((`instances`.`price` * `instances`.`quantity`),2) AS `price`,`instances`.`is_promotion` AS `is_promotion`,`instances`.`obs_date` AS `obs_date`,`instances`.`market` AS `market` from `instances`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `v_facturas` AS select `v_tickets`.`obs_date` AS `fecha`,sum(`v_tickets`.`price`) AS `ticket` from `v_tickets` group by `v_tickets`.`obs_date` order by `fecha` desc;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `v_last_prices` AS select `rv_last_prices`.`id_last_price` AS `id`,concat(`rv_last_prices`.`product`,', ',`rv_last_prices`.`brand`,(case when (`rv_last_prices`.`ptype` is null) then '' else concat(', ',`rv_last_prices`.`ptype`) end),(case when (`rv_last_prices`.`psubtype` is null) then '' else concat(', ',`rv_last_prices`.`psubtype`) end)) AS `product_all`,format(`rv_last_prices`.`presentation`,3) AS `presentation`,`rv_last_prices`.`normal_price` AS `normal_price`,round(`rv_last_prices`.`normal_unit`,2) AS `normal_unit`,(curdate() - `rv_last_prices`.`normal_date`) AS `normal_date`,`rv_last_prices`.`promotion_price` AS `promotion_price`,`rv_last_prices`.`promotion_unit` AS `promotion_unit`,(curdate() - `rv_last_prices`.`promotion_date`) AS `promotion_date`,`rv_last_prices`.`product` AS `product_name`,`rv_last_prices`.`pclass` AS `product_class`,`rv_last_prices`.`brand` AS `product_brand`,`rv_last_prices`.`ptype` AS `product_ptype`,`rv_last_prices`.`psubtype` AS `product_psubtype` from `rv_last_prices` order by `rv_last_prices`.`pclass`,`rv_last_prices`.`product`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `v_tickets` AS select `rv_tickets`.`product_id` AS `product_id`,`products`.`product` AS `product`,`products`.`brand` AS `brand`,`products`.`ptype` AS `ptype`,`products`.`psubtype` AS `psubtype`,round(sum(`rv_tickets`.`quantity`),3) AS `quantity`,round(sum(`rv_tickets`.`price`),2) AS `price`,round(sum(`rv_tickets`.`price`),0) AS `std_price`,`rv_tickets`.`is_promotion` AS `is_promotion`,`rv_tickets`.`obs_date` AS `obs_date`,`rv_tickets`.`market` AS `market` from (`rv_tickets` join `products` on((`products`.`id_product` = `rv_tickets`.`product_id`))) group by `rv_tickets`.`product_id`,`rv_tickets`.`is_promotion`,`rv_tickets`.`obs_date`,`rv_tickets`.`market` order by `rv_tickets`.`product_id` desc;

DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `create_instance`(
	IN n_product_id int,
    IN n_quantity float,
    IN n_price float,
    IN n_is_promtion int,
    IN n_market varchar(255)
)
BEGIN

INSERT INTO `mercado`.`instances`
(`product_id`, `quantity`, `price`, `obs_date`, `is_promotion`, `market`)
VALUES
(n_product_id, n_quantity, n_price, CURDATE(), n_is_promtion, n_market);

END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `create_product`(
	IN n_product varchar(255),
    IN n_brand varchar(255),
    IN n_ptype varchar(255),
    IN n_psubtype varchar(255),
    IN n_presentation float
)
BEGIN

INSERT INTO `mercado`.`products`
(`product`, `brand`, `ptype`, `psubtype`, `presentation`)
VALUES
(n_product, n_brand, n_ptype, n_psubtype, n_presentation);

END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `search_product`(
	IN n_product varchar(255)
)
BEGIN

SELECT * FROM products WHERE product = n_product;
 
END$$
DELIMITER ;
