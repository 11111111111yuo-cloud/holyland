/* ============================================================
   firebase-config.js
   إعداد Firebase للموقع + طبقة المزامنة اللحظية (Real-time Sync)
   ------------------------------------------------------------
   هذا الملف يجعل أي تعديل يقوم به المدير (منتج، عرض، شعار، صورة،
   تصنيف...) يظهر فوراً لكل الزوار المفتوح عندهم الموقع في نفس
   اللحظة، عبر الاستماع اللحظي onSnapshot بدلاً من التحميل مرة
   واحدة get().

   ⚠️ خطوة مطلوبة منك قبل النشر:
   استبدل القيم أدناه ببيانات مشروعك الحقيقية من:
   Firebase Console > Project Settings > General > Your apps > SDK setup and configuration
   ============================================================ */

// ============ 1) بيانات إعداد مشروع Firebase ============
const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY_HERE",
  authDomain: "holylandhr.firebaseapp.com",
  projectId: "holylandhr",
  storageBucket: "holylandhr.appspot.com",
  messagingSenderId: "PASTE_YOUR_SENDER_ID_HERE",
  appId: "PASTE_YOUR_APP_ID_HERE"
};

// ============ 2) تهيئة Firebase ============
firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();

// بعض الشبكات (خصوصاً خلف بروكسي/فايروول أو اتصال جوّال غير مستقر) تحظر أو
// تؤخّر اتصال البث الحي (WebChannel streaming) الذي يحاوله Firestore افتراضياً
// أولاً. عندها تضطر المكتبة تفشل عدة مرات (أخطاء "could not reach backend" /
// "client is offline" تظهر لثوانٍ) قبل ما ترجع تلقائياً لطريقة Long Polling
// المتوافقة أكثر. هذا الإعداد يفرض استخدام Long Polling مباشرة من أول محاولة،
// فيتفادى الموقع ضياع تلك الثواني بالكامل ويتصل بسرعة من أول مرة.
db.settings({
  experimentalAutoDetectLongPolling: true,
  merge: true
});
const fbStorage = firebase.storage();

// تم تفعيل التخزين المحلي (offline persistence) هنا عمداً.
// السبب: لما تُحفَظ أي تعديلات (مثلاً تغيير قسم منتج) والشبكة غير مستقرة،
// كان يظهر التعديل على الشاشة فوراً (تحديث محلي متفائل) لكنه يضيع بالكامل
// لو أُعيد تحميل الصفحة قبل أن يصل الحفظ فعلياً لسيرفر Firestore — لأنه
// ما كان فيه أي مكان يُخزَّن فيه التعديل المعلَّق بانتظار اكتمال الاتصال.
// بتفعيل هذا الإعداد، أي تعديل يُخزَّن أولاً في IndexedDB محلياً، وإذا انقطع
// الاتصال أو تأخر لحظياً، Firestore يعيد إرساله تلقائياً بمجرد عودة الاتصال
// بدل أن يضيع بمجرد تحديث الصفحة.
// أما مخاوف "عرض بيانات قديمة" — فهذه محلولة أصلاً بكود إعادة الاتصال
// الإجباري أسفل هذا الملف (visibilitychange) الذي يجبر Firestore على
// جلب أحدث نسخة من السيرفر بمجرد عودة التبويب للواجهة.
db.enablePersistence({ synchronizeTabs: true }).catch(function (err) {
  console.warn("Firestore offline persistence not enabled:", err.code);
});

// إعادة تفعيل الاتصال بالسيرفر فوراً عند عودة التطبيق/التبويب للواجهة
// (يمنع بقاء الجهاز على بيانات قديمة بعد تعليق الاتصال في الخلفية).
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible") {
    db.disableNetwork()
      .then(function () {
        return db.enableNetwork();
      })
      .catch(function (err) {
        console.warn("Firestore reconnect on visibility change failed:", err);
      });
  }
});

// اسم الـ collection في Firestore الذي تُخزَّن بداخله مستندات بيانات الموقع
const SITE_DATA_COLLECTION = "site_data";

/* ============================================================
   3) طبقة FirebaseCloudStorage
   الواجهة التي يستخدمها index.html للقراءة/الكتابة/الاستماع اللحظي
   ============================================================ */
window.FirebaseCloudStorage = {
  db: db,
  storage: fbStorage,

  /**
   * حفظ/تحديث بيانات (منتجات، عروض، إعدادات...) داخل مستند Firestore.
   * merge:true تضمن عدم حذف أي حقول أخرى موجودة بنفس المستند.
   */
  saveSiteData: async function (dataObj, docId) {
    return db
      .collection(SITE_DATA_COLLECTION)
      .doc(docId)
      .set(dataObj, { merge: true });
  },

  /**
   * تحميل أولي لمرة واحدة (يُستخدم عند أول فتح للصفحة قبل بدء الاستماع اللحظي).
   */
  loadSiteData: async function (docId) {
    const snap = await db.collection(SITE_DATA_COLLECTION).doc(docId).get();
    return snap.exists ? snap.data() : null;
  },

  /**
   * الاستماع اللحظي (Real-time) — onSnapshot بدلاً من get().
   * أي تعديل من لوحة التحكم ينعكس فوراً عند كل الزوار المفتوح عندهم الموقع.
   * يرجع دالة إلغاء الاشتراك (unsubscribe) إن احتجت إيقافه لاحقاً.
   */
  listenSiteData: function (docId, callback) {
    return db
      .collection(SITE_DATA_COLLECTION)
      .doc(docId)
      .onSnapshot(
        function (snap) {
          if (snap.exists) callback(snap.data());
        },
        function (err) {
          console.error("Firestore onSnapshot error [" + docId + "]:", err);
        }
      );
  },

  /**
   * رفع صورة (شعار / منتج / عرض) إلى Firebase Storage وإرجاع رابط تحميل مباشر ثابت.
   * مفيد إن أردت لاحقاً تخزين الصور كملفات في Storage بدل base64 داخل Firestore.
   */
  uploadImage: async function (file, folder) {
    folder = folder || "uploads";
    const path = folder + "/" + Date.now() + "_" + file.name;
    const ref = fbStorage.ref().child(path);
    const snapshot = await ref.put(file);
    return await snapshot.ref.getDownloadURL();
  },

  /**
   * حذف صورة من Firebase Storage عبر رابط التحميل الخاص بها.
   */
  deleteImage: async function (downloadURL) {
    try {
      const ref = fbStorage.refFromURL(downloadURL);
      await ref.delete();
    } catch (e) {
      console.warn("تعذّر حذف الصورة من Storage:", e);
    }
  },

  // ---------------- إشعارات (اختياري، يتطلب firebase-messaging-compat.js) ----------------
  registerDeviceForNotifications: async function () {
    try {
      if (typeof firebase.messaging !== "function") return null;
      const messaging = firebase.messaging();
      const token = await messaging.getToken({
        vapidKey: "PASTE_YOUR_VAPID_KEY_HERE"
      });
      if (token) {
        await db
          .collection("device_tokens")
          .doc(token)
          .set({
            token: token,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
      }
      return token;
    } catch (e) {
      console.warn("تعذّر تسجيل الجهاز للإشعارات:", e);
      return null;
    }
  },

  onForegroundMessage: function (callback) {
    try {
      if (typeof firebase.messaging !== "function") return;
      const messaging = firebase.messaging();
      messaging.onMessage(callback);
    } catch (e) {
      console.warn("Foreground messaging error:", e);
    }
  }
};
