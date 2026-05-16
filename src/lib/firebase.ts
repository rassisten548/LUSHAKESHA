import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export const generateLocalUserId = () => {
    let id = sessionStorage.getItem('parrot_run_user_id');
    if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem('parrot_run_user_id', id);
    }
    return id;
}
