CREATE 
    ALGORITHM = UNDEFINED 
    DEFINER = `root`@`localhost` 
    SQL SECURITY DEFINER
VIEW `v_last_prices` AS
    SELECT 
        `rv_last_prices`.`id_last_price` AS `id`,
        CONCAT(`rv_last_prices`.`product`,
                ', ',
                `rv_last_prices`.`brand`,
                (CASE
                    WHEN (`rv_last_prices`.`ptype` IS NULL) THEN ''
                    ELSE CONCAT(', ', `rv_last_prices`.`ptype`)
                END),
                (CASE
                    WHEN (`rv_last_prices`.`psubtype` IS NULL) THEN ''
                    ELSE CONCAT(', ', `rv_last_prices`.`psubtype`)
                END)) AS `product`,
        `rv_last_prices`.`presentation` AS `presentation`,
        `rv_last_prices`.`normal_price` AS `normal_price`,
        `rv_last_prices`.`normal_unit` AS `normal_unit`,
        (CURDATE() - `rv_last_prices`.`normal_date`) AS `normal_date`,
        `rv_last_prices`.`promotion_price` AS `promotion_price`,
        `rv_last_prices`.`promotion_unit` AS `promotion_unit`,
        (CURDATE() - `rv_last_prices`.`promotion_date`) AS `promotion_date`
    FROM
        `rv_last_prices`