const CONFIG = {
  whatsapp: '5547988573125',
  instagram: 'https://www.instagram.com/explore/search/keyword/?q=zuqui%20garden%20coffee',
  ifood: 'https://www.ifood.com.br/busca?q=Zuqui%20Garden%20Coffee'
};
const message = encodeURIComponent('Olá, Zuqui Café! Gostaria de fazer um pedido ou saber mais.');
document.querySelectorAll('[data-whatsapp]').forEach(a => { a.href = `https://wa.me/${CONFIG.whatsapp}?text=${message}`; a.target = '_blank'; a.rel = 'noopener'; });
document.querySelectorAll('[data-instagram]').forEach(a => { a.href = CONFIG.instagram; a.target = '_blank'; a.rel = 'noopener'; });
document.querySelectorAll('[data-ifood]').forEach(a => { a.href = CONFIG.ifood; a.target = '_blank'; a.rel = 'noopener'; });
const year = document.getElementById('year'); if (year) year.textContent = new Date().getFullYear();
const button = document.querySelector('.menu'); const nav = document.querySelector('#navlinks');
if (button && nav) {
  button.addEventListener('click', () => { const open = button.getAttribute('aria-expanded') === 'true'; button.setAttribute('aria-expanded', String(!open)); nav.classList.toggle('open'); });
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { nav.classList.remove('open'); button.setAttribute('aria-expanded','false'); }));
}
const observer = new IntersectionObserver(items => items.forEach(i => i.isIntersecting && i.target.classList.add('shown')), {threshold:.12}); document.querySelectorAll('.reveal, .cards article, .placeholder').forEach(el => observer.observe(el));
