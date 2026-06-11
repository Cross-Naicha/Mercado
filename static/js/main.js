// Variables
let selected_id = null;
let selected_product = null;
let selected_brand = null;
let selected_ptype = null;
let selected_psubtype = null;
let selected_presentation = null;
let selected_normal_price = null;
let selected_normal_unit = null;

let selected_class_filter = null;

console.log("Version 3.2")

// Funciones de Arranque
window.onload = async function() {

    await open_database();

    await read_products();
    document.getElementById("search_section")
    .scrollIntoView();

};

// Funciones Offline
let db = null;

async function open_database() {

    return new Promise((resolve, reject) => {

        const request = indexedDB.open(
            "mercado_db",
            1
        );

        request.onupgradeneeded = function(event) {

            db = event.target.result;

            if (!db.objectStoreNames.contains("products")) {

                db.createObjectStore(
                    "products",
                    { keyPath: "id" }
                );

            }

        };

        request.onsuccess = function(event) {

            db = event.target.result;
            resolve(db);

        };

        request.onerror = function(event) {

            reject(event);

        };

    });

}

async function save_products_local(products) {

    const transaction = db.transaction(
        ["products"],
        "readwrite"
    );

    const store = transaction.objectStore(
        "products"
    );

    await store.clear();

    for (const product of products) {
        store.put(product);
    }

}

async function get_products_local() {

    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            ["products"],
            "readonly"
        );

        const store = transaction.objectStore(
            "products"
        );

        const request = store.getAll();

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = reject;

    });

}

// Funciones online
async function read_products() {

    console.log("navigator.onLine =",navigator.onLine);
    
    const search = document.getElementById("search").value.toLowerCase();
    
    let data;

    try {

        console.log("Intentando servidor");

        const response = await fetch("/get_products");

        data = await response.json();

        console.log("Servidor respondió");

        await save_products_local(data);

    }
    catch(error) {

        console.log(error);

        console.log(
            "Servidor no disponible. Usando IndexedDB"
        );

        data = await get_products_local();

    }

    // Generacion de los filtros de busqueda
    let filter_class = new Set();

    for (const filter of data) {
        filter_class.add(filter.product_class);
    }

    const filters_container = document.getElementById("filters");
    filters_container.innerHTML = "";

    filters_container.innerHTML += `
        <label>
            <button onclick="apply_class_filter(null)">Todos</button>
        </label>
    `;
    
    for (const filter of filter_class) {
        filters_container.innerHTML += `
            <label>
                <button onclick="apply_class_filter('${filter}')">${filter}</button>
            </label>
            `;
    }

    // Generacion de la tabla
    const container = document.getElementById("data_table");
    container.innerHTML = "";

    for (const product of data) {
        
        if (
            selected_class_filter !== null &&
            product.product_class !== selected_class_filter
        ) {
            continue;
        }

        if (
            !product.product_all
                .toLowerCase()
                .includes(search)
        )
        
        {
            continue;
        }
                
        container.innerHTML += `
        <tr>
            <td>
                [${product.id}] <strong>${product.product_all}</strong>
                <br>
                <button onclick="select_product(
                    ${product.id}, 
                    '${product.product_all}', 
                    '${product.product_name}', 
                    '${product.product_brand}',
                    '${product.product_ptype}',
                    '${product.product_psubtype}',
                    '${product.normal_price}', 
                    '${product.normal_unit}', 
                    '${product.presentation}'
                    )">Seleccionar</button>
                $${product.normal_price} (${product.presentation}) [${product.normal_unit}]
                <br><br>
            </td>
        </tr>
        `
    }
}

function apply_class_filter(filter) {
    selected_class_filter = filter;
    read_products();
}

function select_product(id, product_all, product_name, product_brand, product_ptype, product_psubtype, normal_price, normal_unit, presentation) {

    selected_id = id;
    selected_all = product_all;
    selected_product = product_name;
    selected_brand = product_brand;
    selected_ptype = product_ptype;
    selected_psubtype = product_psubtype;
    selected_presentation = presentation;

    selected_normal_price = normal_price;
    selected_normal_unit = normal_unit;

    document.getElementById("search").value = selected_all;
    read_products();
    another_similar_product();
    
    document.getElementById("product_id").value = selected_id;

    document.getElementById("span_price").textContent =
    ` - $${Number(selected_normal_price).toFixed(2)} -`;

    document.getElementById("compare-section").scrollIntoView({ behavior: "smooth" });

}

function compare_prices() {

    let new_price = Number(document.getElementById("new_price").value);
    
    if (document.getElementById("checkbox_new_price_9_99").checked) {
        new_price = new_price - 0.01;
    }
    
    let new_presentation = Number(document.getElementById("new_presentation").value);

    if (new_presentation === 0) { 
        new_presentation = selected_presentation;
    }

    let new_standard_price = new_price / new_presentation;
    const old_standard_price = selected_normal_unit;

    let promotion_factor = 1
    let promotion_units = 1;

    if (document.getElementById("2x1").checked) {
        promotion_factor = 1/2;
        promotion_units = 2;
    }

    if (document.getElementById("3x2").checked) {
        promotion_factor = 1/3;
        promotion_units = 3;
    }

    if (document.getElementById("4x3").checked) {
        promotion_factor = 1/4;
        promotion_units = 4;
    }

    if (document.getElementById("2_50%").checked) {
        promotion_factor = 0.75;
        promotion_units = 2;
    }

    if (document.getElementById("2_80%").checked) {
        promotion_factor = 0.60;
        promotion_units = 2;
    }

    new_standard_price = new_standard_price * promotion_factor;

    const difference = new_standard_price - old_standard_price;
    const percentage = (difference / old_standard_price) * 100;

    document.getElementById("comparison_result").innerHTML = `
        <br>
        Precio/Unidad: $${new_standard_price.toFixed(2)}
        <br>
        Diferencia: $${difference.toFixed(2)}
        <br>
        Variación: ${percentage.toFixed(2)}%
    `;

    document.getElementById("price").value = new_price;
    document.getElementById("quantity").value = promotion_units;

    if (document.getElementById("checkbox_new_price_9_99").checked) {
        document.getElementById("checkbox_99").checked = false;
    }

    if (document.querySelectorAll('input[name="promotion"]:checked').length > 0) {
        document.getElementById("checkbox_is_promotion").checked = true;
    }
}

function another_similar_product_aux(checkboxID, inputID, value) {
    
    if (document.getElementById(checkboxID).checked) {
        document.getElementById(inputID).value = value;
    } else {
        document.getElementById(inputID).value = "";
    }

}

function another_similar_product() {
    
    another_similar_product_aux("checkbox_product", "product", selected_product);
    another_similar_product_aux("checkbox_brand", "brand", selected_brand);
    another_similar_product_aux("checkbox_ptype", "ptype", selected_ptype);
    another_similar_product_aux("checkbox_psubtype", "psubtype", selected_psubtype);
    another_similar_product_aux("checkbox_presentation", "presentation", selected_presentation);

    if (document.getElementById("checkbox_presentation").checked) {
        document.getElementById("checkbox_presentation_1_1000").checked = false;
    } else {
        document.getElementById("checkbox_presentation_1_1000").checked = true;
    }

}

function clean_promotions() {
    
    if (document.getElementById("checkbox_is_promotion").checked) {
        document.querySelectorAll('input[name="promotion"]').forEach(r => r.checked = false);
        document.getElementById("checkbox_is_promotion").checked = false;
    }
}

function reset_form() {

    // Search
    document.getElementById("search").value = "";
    
    // Products
    document.getElementById("product").value = "";
    document.getElementById("brand").value = "";
    document.getElementById("ptype").value = "";
    document.getElementById("psubtype").value = "";
    document.getElementById("presentation").value = "";

    // Instances
    document.getElementById("product_id").value = "";
    document.getElementById("price").value = "";
    document.getElementById("span_price").innerText = "";
    if (!document.getElementById("checkbox_market").checked) {
        document.getElementById("market").value = "";
    }
    document.getElementById("quantity").value = "1";
    
    // Checkboxes
    document.getElementById("checkbox_is_promotion").checked = false;
    document.getElementById("checkbox_market").checked = true;
    document.getElementById("checkbox_presentation_1_1000").checked = true;

    read_products();

}

async function save_instance_form() {
    
    const product_id = document.getElementById('product_id').value;

    let price = null;
    if (document.getElementById('price').value === "") {
        price = selected_normal_price;
    } else {
        price = Number(document.getElementById('price').value);
    }

    price = document.getElementById("checkbox_99").checked ? price - 0.01 : price;
    
    const is_promotion = document.getElementById('checkbox_is_promotion').checked ? 1 : 0;
    const market = document.getElementById('market').value;
    
    let quantity = Number(document.getElementById('quantity').value);
    quantity = document.getElementById("checkbox_quantity_1_1000").checked ? quantity / 1000 : quantity;
    
    const instances = quantity < 1 ? 1 : quantity;
    for (let i = 0; i < instances; i++) {
    
        const response = await fetch(
            "/add_instance",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    "product_id": product_id,
                    "quantity": quantity < 1 ? quantity : 1,
                    "price": price,
                    "is_promotion": is_promotion,
                    "market": market
                })
            }
        )
        const data = await response.json();
    }

    await read_products();

    document.getElementById("product_id").value = "";
    document.getElementById("price").value = "";
    document.getElementById("quantity").value = "1";

    reset_form();

}

async function save_product_form() {
    
    const product = document.getElementById('product').value;
    const brand = document.getElementById('brand').value;
    const ptype = document.getElementById('ptype').value;
    const psubtype = document.getElementById('psubtype').value;
    
    let presentation = document.getElementById('presentation').value;
    
    if (document.getElementById("checkbox_presentation_1_1000").checked) {
        presentation = presentation / 1000;
    }

    const response = await fetch(
        "/add_product",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "product": product,
                "brand": brand,
                "ptype": ptype === "" ? null : ptype,
                "psubtype": psubtype === "" ? null : psubtype,
                "presentation": Number(presentation)
            })
        }
    )

    const data = await response.json();
    await read_products();
    reset_form();

    document.getElementById("product").value = "";
    document.getElementById("brand").value = "";
    document.getElementById("ptype").value = "";
    document.getElementById("psubtype").value = "";
    document.getElementById("presentation").value = "";
}

if ("serviceWorker" in navigator) {

    navigator.serviceWorker
        .register("/sw.js", {scope: "/"});

}