$(document).ready(function () {
  $(".item-table th").on("click", function () {
    const index = $(this).index();
    const rows = $(".item-table tbody tr").get();
    const isNumericColumn = $(this).hasClass("numeric");
    let isAscending = $(this).hasClass("sorted-asc");

    // Reset sorting arrows
    $(".item-table th").removeClass("sorted-asc sorted-desc");

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
      $(".item-table tbody").append(row);
    });

    if (isAscending) {
      $(this).addClass("sorted-desc");
    } else {
      $(this).addClass("sorted-asc");
    }
  });

  $("#search").on("input", function () {
    const searchBy = $("#searchBy").val();
    var query = $(this).val().toLowerCase();
    if (searchBy === "type") {
      query = $("#searchType").val().toLowerCase();
    }

    let resultCount = 0;

    $(".item-table tbody tr").each(function () {
      var by = "";
      switch (searchBy) {
        case "name":
          by = "td.table-title";
          break;
        case "publisher":
          by = "td.table-publisher";
          break;
        case "type":
          by = "td.table-type";
          break;
        default:
          break;
      }

      const text = $(this).find(by).text().toLowerCase();

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
    var searchTerm = $(this).val().toLowerCase();
    if (searchBy === "type") {
      searchTerm = $("#searchType").val().toLowerCase();
    }

    $(".item-table tbody tr").each(function () {
      const name = $(this).find("td.table-title").text().toLowerCase();
      const publisher = $(this).find("td.table-publisher").text().toLowerCase();
      const type = $(this).find("td.table-type").text().toLowerCase();

      var typeText = "";
      switch (type) {
        case "Songs":
          typeText = "Songs";
          break;
        case "NoteSkins":
          typeText = "NoteSkins";
          break;
        case "SoundEffects":
          typeText = "SoundEffects";
          break;
        case "GlobalLua":
          typeText = "GlobalLua";
          break;
        default:
          break;
      }

      const match =
        (searchBy === "name" && name.includes(searchTerm)) ||
        (searchBy === "publisher" && publisher.includes(searchTerm)) ||
        (searchBy === "type" && type.includes(searchTerm));

      $(this).toggle(match);
    });
  });

  $("#searchBy").on("change", function () {
    var searchBy = $(this).val();
    if (searchBy === "type") {
      $("#search").addClass("search-hidden");
      $("#searchTypeView").removeClass("search-hidden");
    } else {
      $("#search").removeClass("search-hidden");
      $("#searchTypeView").addClass("search-hidden");
    }

    $("#search").trigger("input");
  });

  $("#searchType").on("change", function () {
    $("#search").trigger("input");
  });

  $(".jacket-img").on("click", function () {
    var src = $(this).attr("src");
    var alt = $(this).attr("alt");
    $("body").append(
      '<div class="popup">' +
        '<div class="popup-inside">' +
        "<div>" +
        '<div class="popup-white">' +
        '<img class="popup-image" src="' +
        src +
        '">' +
        '<p class="popup-text">' +
        alt +
        "</p>" +
        "</div>" +
        "</div>" +
        "</div>" +
        '<span class="popup-close">×</span>' +
        "</div>"
    );
    $(".popup").fadeIn();
    $(".popup-image").on("click", function () {
      var imageId = src.substr(src.indexOf("/d/") + 3);
      window.location.href = "https://drive.google.com/uc?export=download&id=" + imageId;
    });
    
    $(".popup div, .popup-close").on("click", function () {
      if ($(this).attr('class') === "popup-white"){
        return false;
      }
      $(".popup").fadeOut(function () {
        $(this).remove();
      });
    });
  });
});

function downloadThis(text) {
  var orgUrl = "";
  var keyLength = text.codePointAt(0) - 50;

  var key = "";
  var viewUrl = text.substr(1 + keyLength);

  for (var i = 0; i < keyLength; i++) {
    key =
      key +
      String.fromCodePoint(text.substr(1, keyLength).codePointAt(i) - i * 2);
  }

  for (var i = 0; i < viewUrl.length; i++) {
    var j = i;
    while (j >= key.length) {
      j = j - key.length;
    }
    orgUrl =
      orgUrl +
      String.fromCodePoint(
        viewUrl.codePointAt(i) - key.codePointAt(j) - i * 2 + j
      );
  }
  window.location.href = orgUrl;
}

function searchPack(text) {
  const search = document.getElementById("search");
  const searchBy = document.getElementById("searchBy");
  search.value = text;
  searchBy.value = "name";

  search.dispatchEvent(new Event("input"));
  searchBy.dispatchEvent(new Event("change"));
}

function searchType(text) {
  const search = document.getElementById("searchType");
  const searchBy = document.getElementById("searchBy");
  search.value = text;
  searchBy.value = "type";

  search.dispatchEvent(new Event("input"));
  searchBy.dispatchEvent(new Event("change"));
}