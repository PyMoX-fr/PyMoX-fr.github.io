// document.querySelectorAll("[data-copy]").forEach((el) => {
//   const button = document.createElement("button");
//   button.className = "copy-button";
//   button.type = "button";
//   button.innerText = "📋 Copier";

//   button.addEventListener("click", () => {
//     navigator.clipboard.writeText(el.innerText).then(() => {
//       button.innerText = "✅ Copié!";
//       setTimeout(() => {
//         button.innerText = "📋 Copier";
//       }, 7000);
//     });
//   });

//   el.parentNode.insertBefore(button, el);
// });

document.querySelectorAll(".copy-target").forEach((el) => {
  // el.addEventListener("mouseover", () => {
  //   setTimeout(() => {
  //     el.setAttribute("title", "📋 Cliquer pour copier");
  //   }, 7000);
  // });
  el.addEventListener("click", () => {
    navigator.clipboard.writeText(el.innerText).then(() => {
      el.setAttribute("title", "✅ Copié !");
      setTimeout(() => {
        el.setAttribute("title", "📋 Cliquer pour copier");
      }, 7000);
    });
  });
});
