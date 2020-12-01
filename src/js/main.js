import "../css/main.css";
import "alpinejs";
import autosize from "autosize";
import GoTrue from "gotrue-js";
import {
    isValidEmail,
    truncate
} from "./utils";

// env variable is declared in netlify site settings, not in config file nor dotenv
const IDENTITY_ENDPOINT = process.env.IDENTITY_ENDPOINT;
const auth = new GoTrue({
    APIUrl: IDENTITY_ENDPOINT
});

window.truncate = (str, len = 150) => truncate(str, len);
window.data = () => ({
    // data used in login/singup modal
    entryModal: {
        email: "",
        password: "",
        remember: false,
        message: false
    },
    email: null,
    notes: null,
    // true if notes are being fetched from the database
    fetchingNotes: false,
    // whether to show confirmation dialog before unload (close/reload page)
    get askBeforeUnload() {
        const newNoteSavable = this.newNote.savable;
        const editNoteChanged = (this.editNoteModal.noteId !== null && this.editNoteModal.noteValueChanged);

        return newNoteSavable || editNoteChanged;
    },
    newNote: {
        textareaValue: "",
        focus: false,
        // whether textareaValue is proper (not starts with whitespace) or not
        get savable() {
            return /^\S[\s\S]*/.test(this.textareaValue);
        }
    },
    // will show if noteId !== null
    editNoteModal: {
        noteId: null,
        // this is basically noteTitle + '\n' + noteContent
        noteValue: "",
        noteValueChanged: false,
        get savable() {
            return /^\S[\s\S]*/.test(this.noteValue);
        }
    },
    // will show if noteId !== null
    deleteNoteModal: {
        noteId: null,
        noteTitle: ""
    },
    // this will run when alpine component initialized
    init({ $refs, $watch, $nextTick }) {
        const hash = (location.hash || "").replace(/^#\/?/, "");
        const hashMatch = hash.match(/(confirmation|recovery)_token=([^&]+)/);
        // get logged in user email
        const userEmail = auth.currentUser()?.email ?? null;
        const editNoteTextarea = $refs.editNoteTextarea;

        // initialiaze autosize for edit note textarea
        autosize(editNoteTextarea);
        $watch("editNoteModal.noteValue", () => {
            $nextTick(() => autosize.update(editNoteTextarea));
        });

        if (hashMatch) {
            // confirm user sing up with the token given in the url hash
            if (hashMatch[1] == "confirmation") {
                this.entryModal.message = "Checking user confirmation token …";
                // this will log user in automatically
                auth.confirm(hashMatch[2], this.entryModal.remember).then((user) => {
                    this.email = user.email;
                    this.fetchNotes();
                }).catch(({ json }) => {
                    this.entryModal.message = json.error_description || json.msg;
                });
            }

            return;
        }

        if (userEmail) {
            this.email = userEmail;
            this.fetchNotes();
        }
    },
    // check whether email/password entered are in correct format
    validate() {
        const email = this.entryModal.email;
        const password = this.entryModal.password;

        if (!isValidEmail(email)) {
            this.entryModal.message = "Invalid email address";
        } else if (!(password.length >= 6 && password.length <= 24)) {
            this.entryModal.message = "Password must be between 6-24 characters";
        } else {
            return true;
        }
    },
    login() {
        const entryModal = this.entryModal;

        auth.login(entryModal.email, entryModal.password, entryModal.remember).then((user) => {
            this.email = user.email;
            this.fetchNotes();
        }).catch(({ json }) => {
            this.entryModal.message = json.error_description || json.msg;
        });
    },
    singup() {
        const entryModal = this.entryModal;

        auth.signup(entryModal.email, entryModal.password).then(() => {
            this.entryModal.message = "A verification link has been sent to your email, open it up to activate your account";
        }).catch(({ json }) => {
            this.entryModal.message = json.error_description || json.msg;
        });
    },
    logout() {
        auth.currentUser().logout().then(() => {
            this.email = null;
            this.notes = null;
        });
    },
    fetchNotes() {
        this.fetchingNotes = true;

        this.makeRequestToServer("GET").then(({ data }) => {
            this.notes = data;
            this.fetchingNotes = false;
        }).catch(console.error);
    },
    createNewNote() {
        const textareaLines = this.newNote.textareaValue.split("\n");
        const title = textareaLines[0];
        const content = textareaLines.slice(1).join("\n");

        this.makeRequestToServer("POST", {
            title,
            content
        }).then(({ timestamp, inserted_id }) => {
            this.newNote.textareaValue = "";

            // add new note to DOM
            this.notes.push({
                _id: inserted_id,
                title,
                content,
                pin: false,
                created: timestamp,
                lastModified: timestamp
            });
            this.reorderNotes();
        }).catch(console.error);
    },
    editNote(noteId) {
        // find note index with id === noteId
        const noteIndex = this.notes.findIndex((note) => note._id === noteId);
        const {
            title: oldTitle,
            content: oldContent
        } = this.notes[noteIndex];
        const textareaLines = this.editNoteModal.noteValue.split("\n");
        const title = textareaLines[0];
        const content = textareaLines.slice(1).join("\n");

        // check whether title/content changes or not
        // if not, just close the modal without make a request
        if (oldTitle === title && oldContent === content) {
            this.editNoteModal.noteId = null;
        } else {
            this.makeRequestToServer("PATCH", noteId, {
                title,
                content
            }).then(({ timestamp }) => {
                this.editNoteModal.noteId = null;

                this.notes[noteIndex].title = title;
                this.notes[noteIndex].content = content;
                this.notes[noteIndex].lastModified = timestamp;
                this.reorderNotes();
            }).catch(console.error);
        }
    },
    togglePinNote(noteId) {
        const noteIndex = this.notes.findIndex((note) => note._id === noteId);
        const notePin = this.notes[noteIndex].pin;

        this.makeRequestToServer("PATCH", noteId, {
            pin: !notePin
        }).then(({ timestamp }) => {
            this.notes[noteIndex].pin = !notePin;
            this.notes[noteIndex].lastModified = timestamp;
            this.reorderNotes();
        }).catch(console.error);
    },
    deleteNote(noteId) {
        this.makeRequestToServer("DELETE", noteId).then(() => {
            this.deleteNoteModal.noteId = null;

            // remove deleted note from DOM
            this.notes = this.notes.filter((note) => note._id !== noteId);
        }).catch(console.error);
    },
    reorderNotes() {
        // pinned note comes first, then sort by most recently modified
        this.notes = this.notes.sort((a, b) => {
            return (a.pin === b.pin) ? b.lastModified - a.lastModified : (a.pin ? -1 : 1);
        });
    },
    makeRequestToServer(method, noteId = null, body = null) {
        const user = auth.currentUser();

        // if second parameter is object, that will be 'body'
        if (noteId && typeof noteId === "object") {
            body = noteId;
            noteId = null;
        }

        let url = `/.netlify/functions/notes${noteId ? "/" + noteId : ""}`;
        let options = {
            method,
            headers: {
                "Authorization": `Bearer ${user.token.access_token}`,
                ...body ? { "Content-Type": "application/json" } : {}
            },
            ...body ? { body: JSON.stringify(body) } : {}
        };

        return new Promise((resolve, reject) => {
            fetch(url, options)
            .then(_ => _.json())
            .then((res) => {
                // if 'status' isn't 0
                if (res.status) {
                    resolve(res);
                } else {
                    reject(res.message);
                }
            });
        });
    }
});
