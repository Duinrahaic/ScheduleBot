using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace SchedulingAssistant.Utilities
{
    public static class WebUtilities
    {
        private static readonly string[] UriRfc3986CharsToEscape = new[] { "!", "*", "'", "(", ")", @"\", "$", "=", "&" };


        internal static Regex WebAddress = new Regex(@"^http:\/\/|^https:\/\/");
        internal static string EscapeUriDataStringRfc3896(string value)
        {
            StringBuilder escaped = new StringBuilder(Uri.EscapeDataString(value));

            // Upgrade the escaping to RFC 3986, if necessary.
            for (int i = 0; i < UriRfc3986CharsToEscape.Length; i++)
            {
                escaped.Replace(UriRfc3986CharsToEscape[i], Uri.HexEscape(UriRfc3986CharsToEscape[i][0]));
            }

            escaped.Replace("%20", "+");
            escaped.Replace("/", "%2F");

            // Return the fully-RFC3986-escaped string.
            return escaped.ToString();
        }

        internal static bool IsWebAddress(string value)
        {
            return WebAddress.IsMatch(value);
        }
    }
}
