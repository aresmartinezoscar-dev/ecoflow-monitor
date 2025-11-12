const firebaseConfig = {
  apiKey: "AIzaSyD8_MIuZRDpmd0FnUPYMqpBckNBYbP3YtM",
  authDomain: "ecoflow-monitoreo.firebaseapp.com",
  databaseURL: "https://ecoflow-monitoreo-default-rtdb.firebaseio.com",
  projectId: "ecoflow-monitoreo",
  storageBucket: "ecoflow-monitoreo.firebasestorage.app",
  messagingSenderId: "284778023823",
  appId: "1:284778023823:web:c9af7b69467445145419fa"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
