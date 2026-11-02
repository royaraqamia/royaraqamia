# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Line numbers stay in a minified release, and the source file name does not
# (#667). A crash report is retraced against the mapping R8 writes beside the
# build (`android/app/build/outputs/mapping/release/mapping.txt`, ADR-0094): the
# frames name obfuscated classes and methods, and the line number is what makes
# the mapping able to say which line of which method. Without this the report
# would arrive with frames that no mapping can restore, which is a report nobody
# can act on - the failure this feature exists to end.
#
# `-renamesourcefileattribute` keeps the file name out of the APK: a retrace
# needs the mapping, not a path, and the path is the only part that could name
# something the report should not carry.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
