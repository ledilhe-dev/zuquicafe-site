const CONFIG = {
  whatsapp: '5547988573125',
  instagram: 'https://www.instagram.com/zuquicafe/',
  ifood: 'https://www.ifood.com.br/delivery/itapema-sc/panificadora-e-mercado-canto-da-praia-zuqui-canto-da-praia/09043574-7bd8-44e0-aff3-63025b07087d'
};

const whatsappMessage = encodeURIComponent('Olá! Vim pelo site do Zuqui Café e gostaria de falar com a equipe.');
const externalLink = (element, url) => {
  element.href = url;
  element.target = '_blank';
  element.rel = 'noopener noreferrer';
};

document.querySelectorAll('[data-whatsapp]').forEach(element => externalLink(element, `https://wa.me/${CONFIG.whatsapp}?text=${whatsappMessage}`));
document.querySelectorAll('[data-instagram]').forEach(element => externalLink(element, CONFIG.instagram));
document.querySelectorAll('[data-ifood]').forEach(element => externalLink(element, CONFIG.ifood));

const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

const menuButton = document.querySelector('.menu-button');
const navigation = document.querySelector('#main-nav');
if (menuButton && navigation) {
  menuButton.addEventListener('click', () => {
    const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!isOpen));
    navigation.classList.toggle('open', !isOpen);
    document.body.classList.toggle('menu-open', !isOpen);
  });
  navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    navigation.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
  }));
}

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('shown');
      observer.unobserve(entry.target);
    }
  }), { threshold: 0.12 });
  document.querySelectorAll('.reveal, .product-list article, .delivery-options article').forEach(element => observer.observe(element));
} else {
  document.querySelectorAll('.reveal, .product-list article, .delivery-options article').forEach(element => element.classList.add('shown'));
}

const galleryPhotos = [
  { src: 'assets/photos/frente.webp', alt: 'Fachada do Zuqui Garden Coffee à noite', width: 1264, height: 1095 },
  { src: 'assets/photos/vitrine.webp', alt: 'Vitrine do Zuqui com brownies e produtos de padaria', width: 939, height: 1255 },
  { src: 'assets/photos/doce.webp', alt: 'Tortinhas de chocolate com cereja produzidas pelo Zuqui', width: 927, height: 1255 },
  { src: 'assets/photos/doce2.webp', alt: 'Café e croissants servidos no Zuqui', width: 1103, height: 1255 }
];
const gallery = document.getElementById('official-gallery');
if (gallery && galleryPhotos.length) {
  const fragment = document.createDocumentFragment();
  galleryPhotos.forEach(photo => {
    if (!photo.src) return;
    const figure = document.createElement('figure');
    const image = document.createElement('img');
    image.src = photo.src;
    image.alt = photo.alt || '';
    image.loading = 'lazy';
    image.decoding = 'async';
    if (photo.width) image.width = photo.width;
    if (photo.height) image.height = photo.height;
    figure.appendChild(image);
    fragment.appendChild(figure);
  });
  gallery.appendChild(fragment);
  gallery.hidden = !gallery.childElementCount;
}
