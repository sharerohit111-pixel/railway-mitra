import { Share } from '@capacitor/share';

window.RailwayMitraNativeShare = {
  async share(data) {
    return Share.share({
      title: data.title || 'Railway Mitra',
      text: data.text || '',
      url: data.url || '',
      dialogTitle: 'Share Railway Mitra'
    });
  }
};
