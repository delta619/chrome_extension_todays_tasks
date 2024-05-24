const add_todo_input = document.getElementById("new_todo_input");
const getButton = document.getElementById("get");
const textBox = document.getElementById("storage");
const test_btn = document.getElementById("test");
const clear_btn = document.getElementById("clear");
const todos_container = document.getElementById("todos_container");
let db = {}; // {"domain1": [{}, {}], "domain2": [{}, {}]}
let domain;

// Function to create HTML for a single todo
const create_todo_html = (val, done) => {
    const todo = document.createElement("div");
    todo.className = "todo";

    const delete_btn = document.createElement("button");
    delete_btn.className = "delete_todo";
    delete_btn.innerHTML = "X";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "todo_checkbox";
    checkbox.checked = done;

    const todo_text = document.createElement("span");
    todo_text.className = "todo_text";
    todo_text.innerHTML = val;

    todo.appendChild(delete_btn);
    todo.appendChild(checkbox);
    todo.appendChild(todo_text);

    if (done) {
        todo.classList.add("done");
    }

    return todo;
};

// Function to add a todo
const addTodo = (domain, val) => {
    if (domain in db) {
        db[domain].push({ val, done: false });
    } else {
        db[domain] = [{ val, done: false }];
    }

    todos_container.appendChild(create_todo_html(val, false));
    add_todo_input.value = "";
    updateStorage();
};

// Function to delete a todo
const deleteTodo = (domain, val) => {
    db[domain] = db[domain].filter((todo) => todo.val !== val);
    updateStorage();
};

// Function to retrieve all todos from storage
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

// Function to update storage
const updateStorage = () => {
    chrome.storage.sync.set(db, () => {
        console.log('Data saved to Chrome storage');
    });
};

// Event listener for adding a todo on Enter key press
add_todo_input.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
        addTodo(domain, add_todo_input.value.trim());
    }
});

// Event delegation for delete button
document.addEventListener('click', (e) => {
    if (e.target && e.target.classList.contains('delete_todo')) {
        const todoText = e.target.parentElement.querySelector('.todo_text').innerHTML;
        deleteTodo(domain, todoText);
        e.target.parentElement.remove();
    }
});

// Event listener for toggling todo completion
todos_container.addEventListener('change', (e) => {
    if (e.target && e.target.classList.contains('todo_checkbox')) {
        const todoText = e.target.nextElementSibling.innerHTML;
        const isDone = e.target.checked;
        updateTodoStatus(domain, todoText, isDone);
    }
});

// Function to update todo status
const updateTodoStatus = (domain, val, isDone) => {
    db[domain].forEach((todo) => {
        if (todo.val === val) {
            todo.done = isDone;
        }
    });
    updateStorage();
    if (isDone) {
        todos_container.querySelector(`.todo_text:contains('${val}')`).parentElement.classList.add('done');
    } else {
        todos_container.querySelector(`.todo_text:contains('${val}')`).parentElement.classList.remove('done');
    }
};

// Function to get the current tab's domain
const getCurrentTab = () => {
    chrome.tabs.query({ active: true }, (tabs) => {
        domain = new URL(tabs[0].url).hostname;
        console.log(domain);
        getAllTodosFromStorage();
    });
};

getCurrentTab();

test_btn.onclick = () => {
    console.log(db);
};

clear_btn.onclick = () => {
    chrome.storage.sync.clear(() => {
        db = {};
        todos_container.innerHTML = ''; // Clearing the displayed todos
    });
};
