// ValueRankingPanel.jsx — Admin Console V2, "Nilai & Susunan" menu.
//
// Explanatory/read-only V1, per ChatGPT's explicit instruction: no new
// backend, no invented settings. Describes the REAL 3-stage pipeline
// (ranking/candidate-scoring.mjs -> diversity-selection.mjs ->
// editorial-composition.mjs), verified against those files' own doc
// comments during the mockup pass -- not guessed.
//
// Round 2/15 (2026-08-19): Boost/Pin were wired for real into
// ReviewQueueCard (Semakan) this round -- reviewQueueAdapter.js's
// submitBoostOverride/submitPinOverride/deactivateOverride, already-live
// backend, just never exposed to an admin before. "Apa Admin boleh laras"
// below reflects that; the rest of each module (the underlying weights/
// selection/composition logic itself) is still honestly "Belum tersedia".

export default function ValueRankingPanel() {
  return (
    <div className="value-ranking-panel">
      <p className="bidang-panel__intro">
        Tiga modul berasingan &mdash; nilai berita tidak menyusun, pemilihan tidak menilai
        semula, susunan tidak memilih. Setiap satu buat SATU kerja sahaja.
      </p>

      <div className="value-ranking-panel__card">
        <h2 className="bidang-panel__section-title">1. Nilai Berita</h2>
        <p className="bidang-panel__section-desc">
          Kaedah semasa &mdash; menghasilkan satu angka skor per berita (jumlah mentah, bukan
          peratus/100).
        </p>
        <ul className="value-ranking-panel__factors">
          <li>Kebaruan berita &mdash; kesan besar</li>
          <li>Kualiti sumber &mdash; kesan besar</li>
          <li>Keyakinan klasifikasi bidang &mdash; kesan kecil</li>
          <li>Keutamaan editor (boost) &mdash; +40 apabila digunakan</li>
        </ul>
        <p className="bidang-panel__section-desc">
          <b>Apa Admin boleh laras:</b> Keutamaan editor (boost) -- naikkan berita tertentu
          +40 mata dari kad Semakan. Baki nilai/pemberat masih tetapan asas sistem.
        </p>
      </div>

      <div className="value-ranking-panel__card">
        <h2 className="bidang-panel__section-title">2. Pemilihan 10 Berita</h2>
        <p className="bidang-panel__section-desc">
          Kaedah semasa &mdash; skor daripada Modul 1 ialah INPUT sahaja. Pemilihan ambil calon
          terbaik yang masih ada satu demi satu, tapi kurangkan keutamaan sesuatu berita kalau
          sumber/isu yang sama dah banyak dipilih &mdash; supaya satu sumber tak sapu semua 10
          slot. Bukan kuota tegar, dikurangkan secara berkadar.
        </p>
        <p className="bidang-panel__section-desc">
          <b>Apa Admin boleh laras:</b> Kekalkan dalam pemilihan (pin) -- dari kad Semakan,
          hadkan maksimum 2 berita dikekalkan serentak setiap bidang (dikuatkuasakan
          pelayan). Tiada kawalan &ldquo;slot-band per bidang&rdquo; &mdash; itu belum
          keputusan produk yang dikunci.
        </p>
      </div>

      <div className="value-ranking-panel__card">
        <h2 className="bidang-panel__section-title">3. Susunan Akhir</h2>
        <p className="bidang-panel__section-desc">
          Kaedah semasa &mdash; ambil 10 berita yang Modul 2 dah pilih (susunan skor dikekalkan,
          TAK dinilai semula), semak sahaja: adakah satu sumber terlalu menguasai, dan adakah
          kualiti keseluruhan set cukup tinggi. Semakan akhir, bukan pusingan skor kedua.
        </p>
        <p className="bidang-panel__section-desc">
          <b>Apa Admin boleh laras:</b> Belum tersedia. Nilai ambang semasa masih tahap
          kalibrasi, belum keputusan editorial muktamad.
        </p>
      </div>

      <div className="section-note">
        Naikkan keutamaan dan Kekalkan dalam pemilihan kini boleh digunakan terus dari kad
        berita dalam Berita &rarr; Perlu Semakan.
      </div>
    </div>
  );
}
