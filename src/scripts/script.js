const add_todo_input = document.getElementById("new_todo_input");
const todos_container = document.getElementById("todos_container");
let db = {}; // { "domain": [{ val, done }] }
let domain;

const create_todo_html = (val, done) => {
    const todo = document.createElement("div");
    todo.className = "todo" + (done ? " done" : "");

    const todoContent = document.createElement("div");
    todoContent.className = "todo_content";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "todo_checkbox";
    checkbox.checked = done;

    const todo_text = document.createElement("span");
    todo_text.className = "todo_text";
    todo_text.textContent = val;

    const delete_cross = document.createElement("span");
    delete_cross.className = "delete_cross";

    todoContent.appendChild(checkbox);
    todoContent.appendChild(todo_text);
    todo.appendChild(todoContent);
    todo.appendChild(delete_cross);

    return todo;
};

const addTodo = (val) => {
    if (!val) return;
    if (domain in db) {
        db[domain].push({ val, done: false });
    } else {
        db[domain] = [{ val, done: false }];
    }
    todos_container.appendChild(create_todo_html(val, false));
    add_todo_input.value = "";
    updateStorage();
};

const deleteTodo = (val) => {
    db[domain] = db[domain].filter((todo) => todo.val !== val);
    updateStorage();
};

const toggleTodo = (val, isDone) => {
    db[domain].forEach((todo) => {
        if (todo.val === val) todo.done = isDone;
    });
    updateStorage();
};

const getAllTodosFromStorage = () => {
    chrome.storage.sync.get(domain, (data) => {
        db = data;
        if (domain in data) {
            data[domain].forEach((todo) => {
                todos_container.appendChild(create_todo_html(todo.val, todo.done));
            });
        }
    });
};

const updateStorage = () => {
    chrome.storage.sync.set(db);
};

add_todo_input.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
        addTodo(add_todo_input.value.trim());
    }
});

todos_container.addEventListener("click", (e) => {
    if (e.target.classList.contains("delete_cross")) {
        const todo = e.target.parentElement;
        const val = todo.querySelector(".todo_text").textContent;
        deleteTodo(val);
        todo.remove();
    }

    if (e.target.classList.contains("todo_checkbox")) {
        const todo = e.target.closest(".todo");
        const val = todo.querySelector(".todo_text").textContent;
        const isDone = e.target.checked;
        todo.classList.toggle("done", isDone);
        toggleTodo(val, isDone);
    }
});

const getCurrentTab = () => {
    chrome.tabs.query({ active: true }, (tabs) => {
        domain = new URL(tabs[0].url).hostname;
        getAllTodosFromStorage();
    });
};

getCurrentTab();
