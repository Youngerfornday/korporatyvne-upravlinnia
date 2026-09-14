# Похідний образ: erseco/alpine-moodle:v5.2.2 + залежності composer, вшиті під час збирання.
# Причина: базовий образ не містить vendor/ і виконує `composer install` при КОЖНОМУ старті
# контейнера, завантажуючи ~48 пакетів з api.github.com. Без токена GitHub це нестабільно
# (HTTP 504 / ліміт запитів), а в образі немає git для запасного шляху. Після вшивання
# стартовий `composer install` бачить актуальний vendor/ і нічого не завантажує.
FROM erseco/alpine-moodle:v5.2.2

USER root
RUN apk add --no-cache git
USER nobody

WORKDIR /var/www/html
RUN COMPOSER_CACHE_DIR=/tmp/composer-cache composer install --no-dev --classmap-authoritative --no-interaction \
    && rm -rf /tmp/composer-cache \
    && test -f vendor/autoload.php
