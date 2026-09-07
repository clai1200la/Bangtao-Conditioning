function deleteProgramData(){
  const ok=window.confirm('Delete all Bangtao program data from this browser? This will remove workout history, saved sets, pain logs, notes, weekly completion status, and workout choices. This cannot be undone.');
  if(!ok)return;
  localStorage.removeItem('bangtao12');
  window.alert('Bangtao program data deleted from this browser.');
  window.location.reload();
}
window.deleteProgramData=deleteProgramData;