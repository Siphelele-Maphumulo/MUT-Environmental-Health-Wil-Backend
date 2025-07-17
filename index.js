const form = document.querySelector("#signupForm");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.querySelector("#email").value;
  const title = document.querySelector("#title").value;
  const password = document.querySelector("#password").value;

  const userData = {
    email: email,
    title: title,
    password: password,
  };

  try {
    const response = await fetch("http://localhost:3000/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(userData),
    });

    const result = await response.json();

    if (response.ok) {
      alert(result.message);
    } else {
      alert(result.message);
    }
  } catch (error) {
    console.error("Error during the request:", error);
    alert("Something went wrong. Please try again.");
  }
});
