let data = [
  {title:'Book 1', folder:'fav', status:'done'},
  {title:'Book 2', folder:null, status:'progress'}
];

function openLibrary(){
  show('library-screen');
}

function openCategory(){
  show('category-screen');
  render();
}

function back(){
  show('library-screen');
}

function show(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function render(){
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  data.forEach(item=>{
    const el = document.createElement('div');
    el.className='card';
    el.innerHTML = `
      <div class="menu">⋯</div>
      <div>${item.title}</div>
    `;
    grid.appendChild(el);
  });
}

function search(q){
  console.log('search', q);
}

function filter(){
  alert('filter');
}
