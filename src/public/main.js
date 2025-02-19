$(document).ready(function () {
  $("th").on("click", function () {
    const index = $(this).index();
    const rows = $("tbody tr").get();
    const isNumericColumn = $(this).hasClass("numeric");
    let isAscending = $(this).hasClass("sorted-asc");

    // Reset sorting arrows
    $("th").removeClass("sorted-asc sorted-desc");

    // Sort rows
    rows.sort((rowA, rowB) => {
      const cellA = $(rowA).children().eq(index).text();
      const cellB = $(rowB).children().eq(index).text();

      if (index === 0) {
        let valA = parseInt(cellA, 10);
        let valB = parseInt(cellB, 10);
        return isAscending ? valA - valB : valB - valA;
      }

      let valA = isNumericColumn ? parseFloat(cellA) : cellA.toLowerCase();
      let valB = isNumericColumn ? parseFloat(cellB) : cellB.toLowerCase();

      if (valA < valB) return isAscending ? -1 : 1;
      if (valA > valB) return isAscending ? 1 : -1;
      return 0;
    });

    $.each(rows, function (index, row) {
      $("tbody").append(row);
    });

    if (isAscending) {
      $(this).addClass("sorted-desc");
    } else {
      $(this).addClass("sorted-asc");
    }
  });

  $("#search").on("input", function () {
    const query = $(this).val().toLowerCase();
    let resultCount = 0;

    $("tbody tr").each(function () {
      const text = $(this).text().toLowerCase();
      if (text.includes(query)) {
        $(this).show();
        resultCount++;
      } else {
        $(this).hide();
      }
    });

    $("#resultCount").text(`検索結果：${resultCount}件`);
  });

  $("#search").on("input", function () {
    const searchBy = $("#searchBy").val();
    const searchTerm = $(this).val().toLowerCase();

    $("tbody tr").each(function () {
      const name = $(this).find("td.table-title").text().toLowerCase();
      const publisher = $(this).find("td.table-publisher").text().toLowerCase();

      const match =
        (searchBy === "name" && name.includes(searchTerm)) ||
        (searchBy === "publisher" && publisher.includes(searchTerm));

      $(this).toggle(match);
    });
  });
  
      $('img').on('click', function() {
        var src = $(this).attr('src');
        var alt = $(this).attr('alt');
        $('body').append(
            '<div class="popup">' +
            '<span class="popup-close"> </span>' +
            '<div class="popup-inside">' +
            '<div>' +
            '<img class="popup-image" src="' + src + '">' +
            '<p class="popup-text">'+ alt + '</p>' +
            '</div>' +
            '</div>' +
            '</div>'
        );
        $('.popup').fadeIn();

        $('.popup-close').on('click', function() {
            $('.popup').fadeOut(function() {
                $(this).remove();
            });
        });
    });
  
});
