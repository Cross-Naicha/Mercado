CREATE DEFINER=`root`@`localhost` PROCEDURE `create_instance`(
	IN n_product_id int,
    IN n_price float,
    IN n_is_promtion int,
    IN n_market varchar(255)
)
BEGIN

INSERT INTO `mercado`.`instances`
(`product_id`, `price`, `obs_date`, `is_promotion`, `market`)
VALUES
(n_product_id, n_price, CURDATE(), n_is_promtion, n_market);

END