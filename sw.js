const CACHE_NAME = "mercado-v4";

const FILES_TO_CACHE = [
    "/home",
    "/static/css/style.css",
    "/static/js/main.js"
];

self.addEventListener("install", event => {

    event.waitUntil(

        caches.open(CACHE_NAME)
            .then(async cache => {

                for (const file of FILES_TO_CACHE) {

                    try {

                        await cache.add(file);

                        console.log(
                            "Cacheado:",
                            file
                        );

                    }
                    catch(error) {

                        console.error(
                            "Error cacheando:",
                            file,
                            error
                        );

                    }

                }

            })

    );

});

self.addEventListener("fetch", event => {

    if (
        event.request.url.includes(
            "/get_products"
        )
    ) {
        return;
    }

    event.respondWith(

        caches.match(event.request)
            .then(response => {

                if (response) {
                    return response;
                }

                return fetch(event.request);

            })
            .catch(() => {

                return caches.match("/home");

            })

    );

});