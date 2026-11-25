const productNav = document.querySelector('.product-tabs');
if (productNav) {
  const productTabs = [...productNav.querySelectorAll('a')];
  const panels = productTabs.map(tab => document.getElementById(tab.hash.slice(1)));
  productNav.setAttribute('role', 'tablist');

  function selectProduct(index) {
    productTabs.forEach((tab, position) => {
      const panel = panels[position];
      const selected = position === index;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', panel.id);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      panel.hidden = !selected;
    });
  }

  function selectFromHash() {
    const hash = location.hash;
    selectProduct(hash === '#sync-releases' || hash.startsWith('#sync-v') ? 1 : 0);
  }

  function activateProduct(index) {
    selectProduct(index);
    const hash = productTabs[index].hash;
    if (location.hash !== hash) history.pushState(null, '', hash);
  }

  productTabs.forEach((tab, index) => {
    tab.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      activateProduct(index);
    });
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === ' ') next = index;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = productTabs.length - 1;
      else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        next = (index + direction + productTabs.length) % productTabs.length;
      } else return;
      event.preventDefault();
      activateProduct(next);
      productTabs[next].focus();
    });
  });
  window.addEventListener('hashchange', selectFromHash);
  window.addEventListener('popstate', selectFromHash);
  selectFromHash();
}

const cards=[...document.querySelectorAll('.history > .release')];
const filterButtons=[...document.querySelectorAll('[data-filter]')];
function filter(mode){let count=0;for(const card of cards){card.hidden=mode==='breaking'&&card.dataset.breaking!=='true';if(!card.hidden)count++;}for(const button of filterButtons)button.setAttribute('aria-pressed',String(button.dataset.filter===mode));document.getElementById('filter-status').textContent=`${count} ${mode==='breaking'?'releases with breaking changes':'releases'} shown.`;}
if(filterButtons.length){document.querySelector('.filters').hidden=false;for(const button of filterButtons)button.addEventListener('click',()=>filter(button.dataset.filter));}
for(const anchor of document.querySelectorAll('a[href^="#v"],a[href="#react-migration"]'))anchor.addEventListener('click',()=>filter('all'));
const tabs=[...document.querySelectorAll('.install-tabs [role="tab"]')];
function select(tab,focus=false){for(const item of tabs){const active=item===tab;item.setAttribute('aria-selected',String(active));item.tabIndex=active?0:-1;document.getElementById(item.getAttribute('aria-controls')).hidden=!active;}if(focus)tab.focus();}
if(tabs.length){document.querySelector('.install-tabs').hidden=false;select(tabs[0]);for(const [index,tab] of tabs.entries()){tab.addEventListener('click',()=>select(tab));tab.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();select(tabs[next],true);});}}
for(const button of document.querySelectorAll('[data-copy]')){button.hidden=false;button.addEventListener('click',async()=>{const command=document.getElementById(button.dataset.copy).querySelector('code').textContent;try{await navigator.clipboard.writeText(command);button.textContent='Copied';document.getElementById('copy-status').textContent='Install command copied.';}catch{button.textContent='Select command to copy';document.getElementById('copy-status').textContent='Clipboard unavailable. Select the command above to copy it.';}setTimeout(()=>button.textContent='Copy command',2000);});}
