CREATE 
    ALGORITHM = UNDEFINED 
    DEFINER = `root`@`localhost` 
    SQL SECURITY DEFINER
VIEW `rv_last_prices` AS
    SELECT 
        `products`.`id_product` AS `id_last_price`,
        `products`.`product` AS `product`,
        `products`.`brand` AS `brand`,
        `products`.`ptype` AS `ptype`,
        `products`.`psubtype` AS `psubtype`,
        `products`.`presentation` AS `presentation`,
        `normal_instances`.`price` AS `normal_price`,
        (`normal_instances`.`price` / `products`.`presentation`) AS `normal_unit`,
        `normal_instances`.`obs_date` AS `normal_date`,
        `promotion_instances`.`price` AS `promotion_price`,
        (`promotion_instances`.`price` / `products`.`presentation`) AS `promotion_unit`,
        `promotion_instances`.`obs_date` AS `promotion_date`
    FROM
        ((`products`
        LEFT JOIN `instances` `normal_instances` ON ((`normal_instances`.`id_instance` = (SELECT 
                `instances`.`id_instance`
            FROM
                `instances`
            WHERE
                ((`instances`.`product_id` = `products`.`id_product`)
                    AND (`instances`.`is_promotion` = 0))
            ORDER BY `instances`.`obs_date` DESC
            LIMIT 1))))
        LEFT JOIN `instances` `promotion_instances` ON ((`promotion_instances`.`id_instance` = (SELECT 
                `instances`.`id_instance`
            FROM
                `instances`
            WHERE
                ((`instances`.`product_id` = `products`.`id_product`)
                    AND (`instances`.`is_promotion` = 1))
            ORDER BY `instances`.`obs_date` DESC
            LIMIT 1))))