/* ============================================================
   service-worker.js — نسخة "تفجير ذاتي" مؤقتة
   ------------------------------------------------------------
   الهدف الوحيد لهذا الملف: إلغاء تسجيل أي Service Worker قديم
   عالق في متصفحات الزوار، ومسح كل ملفات الكاش القديمة المخزّنة
   محلياً، حتى يعود الموقع يقرأ كل شيء طازج من الشبكة مباشرة.

   بعد رفع هذا الملف، أول مرة يفتح فيها أي زائر (أو أنت) الموقع:
   1) هذا الملف يستبدل أي service-worker.js قديم كان مسجَّلاً.
   2) install → يتخطى مرحلة الانتظار فوراً (skipWaiting).
   3) activate → يمسح كل الكاش القديم، ثم يلغي تسجيل نفسه بالكامل
      (self.registration.unregister())، ويطلب من كل الصفحات
      المفتوحة إعادة تحميل نفسها لتتحرر من سيطرة أي Worker.

   ملاحظة: بعد أن تتأكد أن المشكلة انحلّت عند كل الزوار (يكفي أسبوع
   أو أسبوعين)، تقدر تحذف استدعاء navigator.serviceWorker.register
   من index.html نهائياً إن ما كنت تخطط لاستخدام PWA حقيقي مستقبلاً،
   لتفادي تكرار هذه المشكلة.
   ============================================================ */

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (cacheNames) {
        return Promise.all(
          cacheNames.map(function (cacheName) {
            return caches.delete(cacheName);
          })
        );
      })
      .then(function () {
        return self.registration.unregister();
      })
      .then(function () {
        return self.clients.matchAll({ type: 'window' });
      })
      .then(function (clients) {
        clients.forEach(function (client) {
          client.navigate(client.url);
        });
      })
  );
});
